import type { Sport, Workout } from '../log/types'
import { blockWeeks } from '../plan/cycle'
import { addDays, daysBetween, weekStart } from '../plan/dates'
import type { Block, BlockSport, CoachNote, PlanEvent, WeekKind } from '../plan/types'
import { FINDINGS } from './evidence'
import type { TrainingHistory, WorkPattern } from './history'
import { excluded, healthFlags, injuryTitle, progress } from './screening'
import type { Aggravator, AthleteProfile, RaceLeg } from './types'

// The rule-based coach (section 11c, without an AI): turns the screening and the research
// library into a training block for the existing planner, which then places every session
// around shifts and events. Each choice records the findings behind it, or says plainly
// that it's a coaching judgement. Pure functions, so every rule is tested.

/** One choice and why: research finding ids, or `judgement` for a coaching convention. Stored on the block. */
export type Decision = CoachNote

export type CoachBlock = Omit<Block, 'id' | 'createdAt' | 'updatedAt'>
export type BrickDraft = Omit<Workout, 'id' | 'createdAt' | 'updatedAt'>

export interface Proposal {
  block: CoachBlock
  /** Brick workouts to add to the library; their ids become the block's benchmarks. */
  bricks: BrickDraft[]
  decisions: Decision[]
  /** Things to know before accepting (cleared-by-a-professional, short lead time…). */
  warnings: string[]
  startHours: number
  peakHours: number
}

export type CoachResult = { ok: true; proposal: Proposal } | { ok: false; missing: string[] }

export interface CoachInput {
  profile: AthleteProfile | undefined
  events: PlanEvent[]
  history: TrainingHistory
  work: WorkPattern
  today: string
  weekStartsOn: 0 | 1
  /** Recent check-ins include HRV. */
  hrv?: boolean
}

/** Longest block the coach builds in one go; a race further out gets a base block first. */
export const MAX_WEEKS = 20

/** Rough minutes for a hard session, used to share the week's time out. */
/** Race sports tested in this order, one per deload week. */
const TEST_ORDER: Sport[] = ['run', 'bike', 'swim']

const KEY_MIN: Partial<Record<Sport, number>> = { run: 50, bike: 70, swim: 45, strength: 50, erg: 60, row: 75 }
/** Typical session counts for sports kept up alongside the goal. */
const KEEP_MIN = 45

const SHARES = {
  duathlon: { run: 0.4, bike: 0.6 },
  triathlon: { swim: 0.2, bike: 0.5, run: 0.3 },
} as const

const round5 = (m: number) => Math.round(m / 5) * 5
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const h1 = (n: number) => Math.round(n * 10) / 10

/** Which sports a set of aggravators keeps out. */
function blockedSports(excl: Aggravator[]): Set<Sport> {
  const out = new Set<Sport>()
  if (excl.includes('running') || excl.includes('impact')) out.add('run')
  if (excl.includes('cycling')) out.add('bike')
  if (excl.includes('swimming')) out.add('swim')
  if (excl.includes('rowing')) {
    out.add('row')
    out.add('erg')
  }
  if (excl.includes('lifting')) out.add('strength')
  return out
}

/** Leg distances in words: "3km run, 10km bike, 2.5km run". */
const km = (m: number) => `${h1(m / 1000)}km`

/** Three bricks for the build weeks of each cycle, easiest first, shaped by the goal race. */
export function brickWorkouts(legs: RaceLeg[], duathlon: boolean): BrickDraft[] {
  const bike = legs.find((l) => l.sport === 'bike')?.distanceM ?? 20000
  const runs = legs.filter((l) => l.sport === 'run').map((l) => l.distanceM)
  const lastRun = runs.at(-1) ?? 5000
  const firstRun = runs[0] ?? 5000
  const pacing = 'Start the run about 5% slower than your race pace for the first kilometre, then build. Ride steadily: no surges.'
  const base = { sport: 'bike' as Sport, type: 'intervals', tags: ['brick', 'coach'], source: 'Coach (rule-based), see Plan › Coach › Research' }
  const raceSim = duathlon
    ? {
        name: `Duathlon simulation: ${km(firstRun * 0.6)} / ${km(bike * 0.5)} / ${km(lastRun)}`,
        description: `Run ${km(firstRun * 0.6)} controlled (no faster than race pace), straight onto the bike for ${km(bike * 0.5)} at steady race effort, then run ${km(lastRun)} at race pace. Practise both transitions. Save something for run 2. ${pacing}`,
        durationSec: Math.round(15 * 60 + firstRun * 0.6 * 0.3 + bike * 0.5 * 0.12 + lastRun * 0.3),
      }
    : {
        name: `Race-pace brick: ${km(bike * 0.5)} bike + ${km(lastRun * 0.5)} run`,
        description: `Warm up, ride ${km(bike * 0.5)} at steady race effort, transition quickly, run ${km(lastRun * 0.5)} at race pace. ${pacing}`,
        durationSec: Math.round(15 * 60 + bike * 0.5 * 0.12 + lastRun * 0.5 * 0.3),
      }
  return [
    {
      ...base,
      name: 'Brick: 45′ bike + 10′ run',
      description: `45′ ride with 3 × 6′ at race effort (3′ easy between), then straight into a 10′ run: the first 5′ at race pace. ${pacing}`,
      durationSec: 60 * 60,
      rpe: 7,
    },
    {
      ...base,
      name: 'Brick: 3 × (10′ bike + 5′ run)',
      description: `After a 15′ warm-up ride: three rounds of 10′ bike at race effort then 5′ run at race pace, with quick changes and 3′ easy after each run. ${pacing}`,
      durationSec: 75 * 60,
      rpe: 8,
    },
    { ...base, ...raceSim, rpe: 8 },
  ]
}

export function coachPlan(input: CoachInput): CoachResult {
  const { profile, events, history, work, today, weekStartsOn } = input
  if (!profile) return { ok: false, missing: ['Fill in the coach screening first'] }
  const prog = progress(profile, events, today)
  if (!prog.complete) return { ok: false, missing: Object.values(prog.missing).flat() }
  const race = events.find((e) => e.id === profile.goal.eventId)!

  const decisions: Decision[] = []
  const warnings: string[] = []
  const say = (area: string, text: string, findings: string[] = [], judgement = !findings.length) => decisions.push({ area, text, findings, judgement })

  // ---- Limits from the screening --------------------------------------------------
  const healthStop = healthFlags(profile.health).some((f) => f.level === 'stop')
  const ill = !!profile.health.recentIllness
  const excl = excluded(profile)
  const blocked = blockedSports(excl)
  const niggles = profile.injuries.filter((i) => i.status !== 'past')
  const stopped = profile.injuries.filter((i) => excl.length && i.aggravatedBy.some((a) => excl.includes(a)))
  if (healthStop) {
    warnings.push('You answered yes to a health question: check with your GP before any hard sessions. Until then this plan has no hard sessions.')
    say('Health', 'No hard sessions until your GP has said hard training is fine; everything is easy aerobic work.', [], true)
  }
  if (stopped.length) {
    warnings.push(`${stopped.map(injuryTitle).join(', ')}: see a physio before training through it. Left out until cleared: ${excl.join(', ')}.`)
    say('Injury', `Left out until a physio clears it: ${excl.join(', ')}. Re-run the coach once you're cleared.`, ['pain-monitoring'], false)
  } else if (niggles.length) {
    say('Injury', `${niggles.map(injuryTitle).join(', ')}: planned around with a slower build. Keep pain during training to about 5/10 at most, settling by the next morning and not getting worse week to week.`, ['pain-monitoring', 'run-progression'])
  }

  // ---- Race and block length --------------------------------------------------------
  const legs = profile.goal.legs
  const legSports = [...new Set(legs.map((l) => l.sport))]
  const triathlon = race.multisport === 'triathlon' || legSports.includes('swim')
  const duathlon = !triathlon && (race.multisport === 'duathlon' || (legSports.includes('bike') && legs.filter((l) => l.sport === 'run').length >= 2))
  const start = addDays(weekStart(today, weekStartsOn), 7)
  const raceIdx = Math.floor(daysBetween(start, race.date) / 7)
  if (raceIdx < 0) return { ok: false, missing: ['the race is before the next training week: pick a later race'] }
  const aRace = race.priority === 'A'
  let weeks = raceIdx + (aRace ? 2 : 1)
  const base = weeks > MAX_WEEKS
  if (base) {
    weeks = 12
    warnings.push(`${race.name} is ${raceIdx + 1} weeks away: this is a 12-week base block. Run the coach again nearer the time for the race block with its taper.`)
  } else if (raceIdx < 3) {
    warnings.push(`${race.name} is only ${Math.max(0, raceIdx + 1)} week${raceIdx === 0 ? '' : 's'} away: there's little time to build, so this mostly keeps you ticking over and fresh.`)
  }

  // A two-week taper for longer A races (the planner already tapers the week before).
  const weekKinds: Record<string, WeekKind> = {}
  const short = profile.goal.format === 'sprint' || profile.goal.format === 'supersprint'
  if (!base && aRace && !short && raceIdx >= 3) weekKinds[addDays(start, (raceIdx - 2) * 7)] = 'taper'

  // ---- Rhythm and progression ----------------------------------------------------------
  const newer = (profile.trainingYears ?? 0) < 2
  const buildWeeks = newer || niggles.length || ill ? 2 : 3
  const runHistory = history.sports.find((s) => s.sport === 'run')
  const progressionPct = niggles.length || ill || !runHistory ? 5 : 8
  say(
    'Rhythm',
    buildWeeks === 2
      ? `${buildWeeks} build weeks then a deload (2:1)${newer ? ', as you’re newer to structured training' : ''}${niggles.length ? ', with a niggle to look after' : ''}${ill ? ', coming back from illness' : ''}.`
      : '3 build weeks then a deload (3:1), the planner’s standard rhythm.',
    [],
    true,
  )
  say('Progression', `Volume steps up ${progressionPct}% each build week and drops to 60% in deloads; running never rises more than about 10% a week. The fitness/fatigue ratio is shown, but not used to plan.`, ['run-progression', 'no-acwr-rules'])

  // ---- Sports and their share of the week --------------------------------------------------
  const share: Partial<Record<Sport, number>> = triathlon ? { ...SHARES.triathlon } : duathlon ? { ...SHARES.duathlon } : Object.fromEntries(legSports.map((s) => [s, 1 / legSports.length]))
  for (const s of blocked) delete share[s]
  if (!Object.keys(share).length) share.bike = 1 // nothing left: keep fitness on the bike
  const crossTrain = legSports.filter((s) => blocked.has(s))
  if (crossTrain.length) say('Injury', `${crossTrain.join(' and ')} replaced by ${Object.keys(share).join(' and ')} for now, so fitness carries on without the movement that hurts.`, ['pain-monitoring'], true)
  const total = Object.values(share).reduce((a, b) => a + b, 0)

  const keep = profile.keep.filter((k) => !blocked.has(k.sport) && k.sport !== 'strength' && !(k.sport in share) && k.sessions > 0)
  const lifts = !blocked.has('strength') && (profile.keep.some((k) => k.sport === 'strength') || profile.equipment.includes('gym'))
  const recent = Math.max(history.recentHoursPerWeek, history.hoursPerWeek)
  // Two strength sessions, or one when there's little training time to share yet.
  const liftSessions = lifts ? (recent > 0 && recent < 4 ? 1 : 2) : 0
  const otherMin = keep.reduce((a, k) => a + k.sessions * KEEP_MIN, 0) + liftSessions * 45
  // ---- How much time ------------------------------------------------------------------
  const av = profile.availability
  const maxHours = av.hoursPerWeek!
  const peakFactor = 1 + (progressionPct / 100) * (buildWeeks - 1)
  // Start from recent training, without cutting the race sports below what you already do
  // to make room for new strength or kept sessions; never above what the limit allows.
  const raceSportHours = history.sports.filter((x) => x.sport in share).reduce((a, x) => a + x.hoursPerWeek, 0)
  const startHours = h1(clamp(recent > 0 ? Math.max(recent, raceSportHours + otherMin / 60) * 1.05 : maxHours * 0.6, 2, maxHours / peakFactor))
  // Each cycle can start a little bigger: the most growth (up to a cap) whose biggest
  // week, as the planner will actually shape the block, stays inside the hours limit.
  const biggest = (g: number) =>
    Math.max(1, ...blockWeeks({ start, weeks, buildWeeks, progressionPct, deloadPct: 60, cycleGrowthPct: g, weekKinds }, events).filter((w) => w.kind === 'build').map((w) => w.volume))
  const growthCap = niggles.length || ill || newer ? 5 : 10
  let cycleGrowthPct = growthCap
  while (cycleGrowthPct > 0 && startHours * biggest(cycleGrowthPct) > maxHours) cycleGrowthPct--
  const peakHours = h1(startHours * biggest(cycleGrowthPct))
  say(
    'Volume',
    `${recent > 0 ? `Starts at ${startHours}h a week (you’ve averaged ${h1(history.hoursPerWeek)}h, ${h1(history.recentHoursPerWeek)}h lately)` : `No recent training logged, so it starts cautiously at ${startHours}h a week`}${
      cycleGrowthPct ? `, grows ${cycleGrowthPct}% each 4-week cycle` : ''
    } and peaks around ${peakHours}h, inside your ${maxHours}h limit.`,
    ['run-progression'],
    false,
  )

  let enduranceMin = startHours * 60 - otherMin
  if (enduranceMin < 120) {
    warnings.push('Your other training takes most of the available time: consider fewer kept sessions so the race sports get enough.')
    enduranceMin = 120
  }
  // Session counts suit the middle of the block; lengths are set for the first weeks and
  // grow from there. No easy session shorter than is worth getting changed for.
  const midEnduranceMin = Math.max(enduranceMin, ((startHours + peakHours) / 2) * 60 - otherMin)
  const FLOOR: Partial<Record<Sport, number>> = { run: 25, bike: 40, swim: 25 }
  const LONG_MIN: Partial<Record<Sport, number>> = { run: 45, bike: 60 }

  // ---- Hard sessions ---------------------------------------------------------------------
  const keyTotal = healthStop ? 0 : startHours < 6 ? 2 : 3
  const canBrick = !healthStop && !!share.bike && !!share.run && (duathlon || triathlon)
  const noRunSpeed = excl.includes('speed work') || excl.includes('hills') || niggles.some((i) => i.aggravatedBy.includes('speed work') || i.aggravatedBy.includes('hills'))
  const order: Sport[] = (triathlon ? ['bike', 'run', 'swim'] : ['bike', 'run', 'run']).filter((s) => s in share) as Sport[]
  const keyBy: Partial<Record<Sport, number>> = {}
  for (let i = 0; i < keyTotal && order.length; i++) {
    const s = order[i % order.length]
    if (s === 'run' && noRunSpeed) continue
    keyBy[s] = (keyBy[s] ?? 0) + 1
  }

  const sessionsFor = (s: Sport, min: number) => {
    const per = s === 'run' ? 45 : s === 'bike' ? 60 : s === 'swim' ? 40 : 50
    return clamp(Math.round(min / per), 2, s === 'swim' ? 3 : 5)
  }
  // Running keeps the time you already give it (up to half the week); the rest goes to the
  // other race sports by their share, so extra volume lands where impact is low.
  const runMinutes = share.run ? Math.min(runHistory ? runHistory.hoursPerWeek * 60 * 1.05 : (enduranceMin * share.run) / total, enduranceMin * 0.5) : 0
  const otherShare = total - (share.run ?? 0)
  const minutesFor = (sport: Sport, frac: number, of: number) =>
    sport === 'run' ? runMinutes * (of / enduranceMin) : otherShare ? ((of - runMinutes * (of / enduranceMin)) * frac) / otherShare : of
  const sports: BlockSport[] = Object.entries(share).map(([s, frac]) => {
    const sport = s as Sport
    const min = minutesFor(sport, frac!, enduranceMin)
    const keyWant = keyBy[sport] ?? 0
    const longOk = (n: number) => sport !== 'swim' && n >= (sport === 'run' ? 3 : 2) && !excl.includes('long sessions') && !niggles.some((i) => i.aggravatedBy.includes('long sessions'))
    const dayCap = Math.max(30, av.weekdayMaxMin ?? 90)
    const longCap = (av.dayOffMaxMin ?? 180) / 1.5
    // Running starts no higher than recent running, plus a little.
    const runCap = sport === 'run' ? (runHistory ? runHistory.hoursPerWeek * 60 * 1.1 : 90) : Infinity
    const midMin = minutesFor(sport, frac!, midEnduranceMin)
    const lengthFor = (n: number, minutes: number, withLong = longOk(n)) => {
      const key = Math.min(keyWant, n - 1)
      const easyCount = n - key + (withLong ? 0.5 : 0)
      return (minutes - key * (KEY_MIN[sport] ?? 50)) / easyCount
    }
    // Enough sessions for a mid-block week, but not so many that its easy sessions get short.
    let sessions = Math.max(sessionsFor(sport, midMin), keyWant + 1)
    while (sessions > Math.max(2, keyWant + 1) && lengthFor(sessions, Math.min(midMin, runCap * (midMin / min))) < (FLOOR[sport] ?? 30)) sessions--
    const key = Math.min(keyWant, sessions - 1)
    const startMin = Math.min(min, runCap)
    // A long session only when it's genuinely long from the first week.
    const long = longOk(sessions) && lengthFor(sessions, startMin, true) * 1.5 >= (LONG_MIN[sport] ?? 60)
    const easyMin = round5(clamp(lengthFor(sessions, startMin, long), 20, Math.min(long ? longCap : dayCap, 150)))
    return { sport, sessions, key, easyMin, long }
  })
  for (const k of keep) sports.push({ sport: k.sport, sessions: k.sessions, key: 0, easyMin: KEEP_MIN, long: false })
  if (lifts) sports.push({ sport: 'strength', sessions: liftSessions, key: healthStop ? 0 : 1, easyMin: 45, long: false })

  const hard = sports.filter((s) => s.sport !== 'strength').reduce((a, s) => a + s.key, 0)
  if (!healthStop)
    say(
      'Hard sessions',
      `${hard} hard session${hard === 1 ? '' : 's'} a week across all sports${noRunSpeed ? ' (none of them running speed work, because of your niggle)' : ''}; everything else easy, at a conversational effort.`,
      ['mostly-easy', 'long-intervals'],
    )
  if (keep.length) say('Other training', `${keep.map((k) => `${k.sessions} × ${k.sport === 'row' ? 'on-water' : k.sport}`).join(', ')} a week kept up, all easy so the race sports get the hard work.`, ['mostly-easy'], false)
  if (lifts)
    say(
      'Strength',
      `${liftSessions} strength sessions a week (${healthStop ? 'both light' : 'one heavy, one lighter with plyometrics'}), easing to maintenance in the taper. On a day off the planner may put lifting and a hard session together: when it does, lift first, or a few hours apart.`,
      ['heavy-strength', 'separate-lifting'],
    )

  // ---- Bricks and race skills -----------------------------------------------------------
  const bricks = canBrick && (keyBy.bike ?? 0) > 0 ? brickWorkouts(legs, duathlon) : []
  if (bricks.length) {
    say('Bricks', 'The hard bike session in each build week is a brick, a different one each week of the cycle and the same ones again next cycle so you can compare. The last is a race simulation.', ['bricks', 'even-bike', 'first-km'])
    if (duathlon) say('Race pacing', 'Bricks and race simulations rehearse a controlled run 1, a steady bike and a strong run 2.', ['duathlon-pacing'])
  }

  // ---- Taper ------------------------------------------------------------------------------
  if (!base && aRace) {
    say(
      'Taper',
      `${short || raceIdx < 3 ? 'A one-week' : 'A two-week'} taper into ${race.name}: volume down to 70% then 50% of peak in race week, with the same number of sessions and short race-pace efforts kept in. A recovery week follows.`,
      ['taper'],
    )
  } else if (!base) {
    say('Race week', `${race.name} is a ${race.priority} race: a lighter race week rather than a full taper.`, [], true)
  }

  // ---- Testing ------------------------------------------------------------------------------
  const tested = TEST_ORDER.filter((t) => sports.some((b) => b.sport === t && b.key > 0))
  if (tested.length && !healthStop)
    say(
      'Testing',
      `The last session of each deload week is a test (${tested.map((t) => ({ run: '30′ run', bike: '20′ bike', swim: '400 + 200 swim' })[t as 'run']).join(', then ')}${tested.length > 1 ? ', in turn' : ''}), while you're fresh. Each one updates your fitness markers, which set the paces and watts of every session.`,
      [],
      true,
    )

  // ---- Fitting it round work and life ---------------------------------------------------------
  say(
    'Your week',
    `Up to ${av.daysPerWeek} training days${av.doubles ? ', doubles allowed' : ''}${av.restDay != null ? `, ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][av.restDay]} kept free` : ''}. The planner puts hard sessions and bricks on your lightest days, keeps them off the mornings after late finishes and before early starts, and shortens easy sessions to fit.`,
    work.source === 'none' ? ['sleep'] : ['sleep', 'plan-around-work'],
  )
  if (input.hrv) say('Daily check', 'When your morning HRV is clearly below its usual level, swap that day’s hard session for an easy one (by hand for now).', ['hrv-guided'])
  if (ill) say('Illness', 'The first week starts easy because you were ill recently; move hard sessions later if you’re not fully back.', [], true)

  const block: CoachBlock = {
    name: base ? `${race.name}: base` : `${race.name} block`,
    goal: [profile.goal.aim && `Aim: ${profile.goal.aim}`, profile.goal.aimNotes].filter(Boolean).join(' · ') || undefined,
    start,
    weeks,
    buildWeeks,
    progressionPct,
    deloadPct: 60,
    cycleGrowthPct: cycleGrowthPct || undefined,
    sports,
    maxDays: av.daysPerWeek!,
    doubles: !!av.doubles,
    restDay: av.restDay,
    benchmarks: [],
    testSports: TEST_ORDER.filter((t) => sports.some((b) => b.sport === t && b.key > 0)),
    libraryMix: 40,
    weekKinds: Object.keys(weekKinds).length ? weekKinds : undefined,
  }

  return { ok: true, proposal: { block, bricks, decisions, warnings, startHours, peakHours } }
}

/** Every finding id a set of decisions relies on, in library order (for "based on" lists). */
export function findingsUsed(decisions: Decision[]) {
  const used = new Set(decisions.flatMap((d) => d.findings))
  return FINDINGS.filter((f) => used.has(f.id))
}
