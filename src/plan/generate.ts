import { newId } from '../log/format'
import type { Sport, Workout } from '../log/types'
import { blockWeeks, weekLabel, type PlanWeek } from './cycle'
import { addDays, clockMin, minClock, weekDates, weekday } from './dates'
import { covers } from './events'
import { dayLoad, weekWork, type DayLoad } from './load'
import { buildOneOff, estimateSec, specsFor } from './oneOffs'
import type { Block, Commitment, Intensity, OneOff, PlanEvent, PlanPrefs, PlannedSession } from './types'

// The planner. For each week of a block it works out what sessions the week needs
// (from the cycle and the block's sports), what each one is (benchmark, library
// workout or one-off) and which day and time it fits best around work and events.

const EASY_TYPES = new Set(['steady', 'easy', 'endurance', 'recovery', 'technique', 'long', 'commute', 'pool', 'open', 'mobility', 'stretching', 'yoga', 'foam', 'walk'])
const HARD_TYPES = new Set(['intervals', 'pieces', 'tempo', 'test', 'race', 'lifting', 'wod', 'mixed'])

/** Reads a library workout's intensity from its RPE, or its type when there's no RPE. */
export function workoutIntensity(w: Pick<Workout, 'rpe' | 'type'>): Exclude<Intensity, 'race'> {
  if (w.rpe != null) return w.rpe >= 7 ? 'key' : w.rpe <= 4 ? 'easy' : 'moderate'
  if (w.type && HARD_TYPES.has(w.type)) return 'key'
  if (w.type && EASY_TYPES.has(w.type)) return 'easy'
  return 'moderate'
}

export const isTest = (w: Workout) => w.type === 'test' || w.tags.some((t) => /test/i.test(t))

export const INTENSITY_LABEL: Record<Intensity, string> = { easy: 'Easy', moderate: 'Steady-hard', key: 'Key', race: 'Race' }

/** Same seed, same plan: re-planning without changes gives the same sessions. */
function seeded(text: string) {
  let h = 1779033703 ^ text.length
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 3432918353)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Slot {
  sport: Sport
  intensity: Intensity
  long?: boolean
  /** Deload check-in: a test or benchmark from the library. */
  test?: boolean
  race?: PlanEvent
  /** Which key/easy slot of this sport this is in the week, for rotating content. */
  nth: number
}

interface Filled {
  slot: Slot
  title: string
  workoutId?: string
  oneOff?: OneOff
  benchmark?: boolean
  durationSec: number
  /** Easy work can be cut down to fit a gap; key work can't. */
  minSec: number
}

export interface PlanInput {
  block: Block
  events: PlanEvent[]
  commitments: Commitment[]
  prefs: PlanPrefs
  workouts: Workout[]
  /** Planned sessions that stay as they are (logged, or locked by hand). */
  fixed: PlannedSession[]
  /** Nothing is planned before this date. */
  from: string
}

export interface PlanResult {
  planned: PlannedSession[]
  weeks: PlanWeek[]
  /** Things that didn't fit or were cut, for telling the athlete. */
  notes: string[]
}

export function planBlock(input: PlanInput): PlanResult {
  const { block, events } = input
  const weeks = blockWeeks(block, events)
  const planned: PlannedSession[] = []
  const notes: string[] = []
  for (const week of weeks) {
    if (week.start < addDays(input.from, -6)) continue
    planned.push(...planWeek(input, week, notes))
  }
  return { planned, weeks, notes }
}

function weekSlots(block: Block, week: PlanWeek, workHours: number, notes: string[]): Slot[] {
  const slots: Slot[] = []
  const endurance = block.sports.filter((s) => s.sport !== 'recovery')
  const dropEasy = workHours > 55 ? 2 : workHours > 45 ? 1 : 0
  const easyCounts = new Map<Sport, number>()

  for (const bs of block.sports) {
    let n = bs.sessions
    let k = Math.min(bs.key, n)
    if (bs.sport !== 'recovery') {
      if (week.kind === 'deload') [n, k] = [Math.max(1, Math.round(n * 0.67)), 0]
      else if (week.kind === 'taper') n = Math.max(k, Math.round(n * 0.8))
      else if (week.kind === 'race' || week.kind === 'recovery') [n, k] = [Math.round(n * 0.5), 0]
    }
    // Lifting stays in the taper but backs off to maintenance.
    const lightLift = bs.sport === 'strength' && (week.kind === 'taper' || week.kind === 'race')
    for (let i = 0; i < k; i++) slots.push({ sport: bs.sport, intensity: lightLift ? 'moderate' : 'key', nth: i })
    for (let i = 0; i < n - k; i++) {
      const long = bs.long && i === 0 && (week.kind === 'build' || week.kind === 'deload' || week.kind === 'taper')
      slots.push({ sport: bs.sport, intensity: 'easy', long, nth: i })
    }
    if (bs.sport !== 'recovery') easyCounts.set(bs.sport, n - k)
  }

  // A heavy work week: drop easy sessions from the sports with the most of them.
  for (let i = 0; i < dropEasy; i++) {
    const [sport, count] = [...easyCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
    if (!sport || !count) break
    const idx = slots.findLastIndex((s) => s.sport === sport && s.intensity === 'easy' && !s.long)
    if (idx < 0) break
    slots.splice(idx, 1)
    easyCounts.set(sport, count - 1)
  }
  if (dropEasy) notes.push(`Week of ${week.start}: ${Math.round(workHours)}h of work, so ${dropEasy} easy session${dropEasy > 1 ? 's' : ''} dropped and easy volume cut`)

  const main = [...endurance].sort((a, b) => b.key - a.key || b.sessions - a.sessions)[0]
  if (week.kind === 'deload' && main) slots.push({ sport: main.sport, intensity: 'key', test: true, nth: 0 })
  if (week.kind === 'race' || week.kind === 'taper') {
    for (const race of week.races) {
      if (race.priority === 'C') continue
      const sport = race.sport ?? (race.multisport ? 'run' : main?.sport)
      if (sport) slots.push({ sport, intensity: 'moderate', nth: 0 })
    }
  }
  for (const race of week.races) {
    // A C race takes the place of a key session in its sport.
    if (race.priority === 'C') {
      const idx = slots.findIndex((s) => s.intensity === 'key' && s.sport === (race.sport ?? s.sport))
      if (idx >= 0) slots.splice(idx, 1)
    }
    slots.push({ sport: race.sport ?? 'other', intensity: 'race', race, nth: 0 })
  }
  return slots
}

function fill(input: PlanInput, week: PlanWeek, slot: Slot, rand: () => number, scale: number, used: Set<string>): Filled {
  const { block, workouts } = input
  const bs = block.sports.find((s) => s.sport === slot.sport)
  const easyMin = (bs?.easyMin ?? 45) * (slot.long ? 1.5 : 1)
  const library = workouts.filter((w) => w.sport === slot.sport)
  const benchmarks = block.benchmarks.map((id) => workouts.find((w) => w.id === id)).filter((w): w is Workout => !!w && w.sport === slot.sport)
  // Tests are kept for the deload check-in; other benchmarks repeat in the build weeks.
  const buildBenchmarks = benchmarks.filter((w) => !isTest(w) && workoutIntensity(w) === slot.intensity)
  const fromLibrary = (w: Workout, benchmark = false): Filled => {
    const sec = estimateSec(w)
    return { slot, title: w.name, workoutId: w.id, benchmark, durationSec: sec, minSec: sec }
  }
  const fromSpec = (intensity: Exclude<Intensity, 'race'>, scaleBy: number): Filled => {
    const specs = specsFor(slot.sport, intensity)
    // Rotate by week so the same slot gets a different session each week.
    const spec = specs[(week.index + slot.nth * 2) % specs.length]
    const oneOff = buildOneOff(slot.sport, spec, easyMin, scaleBy)
    if (slot.long) oneOff.name = `Long ${/^[A-Z][a-z]/.test(oneOff.name) ? oneOff.name.charAt(0).toLowerCase() + oneOff.name.slice(1) : oneOff.name}`
    const sec = estimateSec(oneOff)
    return { slot, title: oneOff.name, oneOff, durationSec: sec, minSec: intensity === 'easy' && oneOff.durationSec ? Math.min(sec, 20 * 60) : sec }
  }
  const pickLibrary = (intensity: Exclude<Intensity, 'race'>) => {
    const pool = library.filter((w) => workoutIntensity(w) === intensity && !block.benchmarks.includes(w.id) && !isTest(w) && !used.has(w.id))
    const pick = pool.length ? pool[Math.floor(rand() * pool.length)] : undefined
    if (pick) used.add(pick.id)
    return pick
  }

  if (slot.race) {
    const r = slot.race
    return { slot, title: r.name, oneOff: { name: r.name, sport: slot.sport, type: 'race', tags: ['race'], description: r.notes }, durationSec: 0, minSec: 0 }
  }

  if (slot.test) {
    // Benchmarked tests first, so the same test closes every cycle; then any test, then a key benchmark.
    const tests = [...benchmarks.filter(isTest), ...library.filter((w) => isTest(w) && !benchmarks.includes(w))]
    const keyBench = benchmarks.filter((w) => workoutIntensity(w) === 'key')
    const pick = tests[0] ?? keyBench[week.index % (keyBench.length || 1)]
    if (pick) return fromLibrary(pick, benchmarks.includes(pick))
    return fromSpec('moderate', 1)
  }

  if (week.kind === 'build' && week.buildNo && !slot.long) {
    // Benchmark i always lands in the same build week and slot of each cycle, so attempts line up.
    const perWeek = slot.intensity === 'key' ? (bs?.key ?? 1) : Math.max(1, (bs?.sessions ?? 1) - (bs?.key ?? 0) - (bs?.long ? 1 : 0))
    const nth = slot.intensity === 'easy' && bs?.long ? slot.nth - 1 : slot.nth
    const bench = buildBenchmarks[(week.buildNo - 1) * perWeek + nth]
    if (bench) return fromLibrary(bench, true)
  }

  if (slot.intensity === 'key') {
    if (week.kind !== 'taper' && rand() * 100 < block.libraryMix) {
      const w = pickLibrary('key')
      if (w) return fromLibrary(w)
    }
    return fromSpec('key', week.kind === 'taper' ? 0.7 : scale)
  }

  const intensity = slot.intensity as Exclude<Intensity, 'race'>
  if (rand() * 100 < block.libraryMix) {
    const w = pickLibrary(intensity)
    if (w && !slot.long) return fromLibrary(w)
  }
  // Easy work grows with the week's volume (less in a heavy work week); steady-hard stays put.
  return fromSpec(intensity, intensity === 'easy' ? scale : 1)
}

interface Day {
  date: string
  load: DayLoad
  away: boolean
  busyEvent: boolean
  race?: PlanEvent
  /** Day before an A or B race: easy only. */
  preRace: boolean
  /** Day after an A race: nothing hard. */
  postRace: boolean
  sessions: { intensity: Intensity; sport: Sport; from: number; to: number }[]
  /** Free windows left after sessions already placed. */
  free: [number, number][]
}

function take(free: [number, number][], from: number, to: number) {
  return free.flatMap(([s, e]): [number, number][] => {
    if (to <= s || from >= e) return [[s, e]]
    return [[s, from] as [number, number], [to, e] as [number, number]].filter(([a, b]) => b - a >= 20)
  })
}

function planWeek(input: PlanInput, week: PlanWeek, notes: string[]): PlannedSession[] {
  const { block, events, commitments, prefs, fixed, from } = input
  const dates = weekDates(week.start)
  const loads = dates.map((d) => dayLoad(d, commitments, prefs))
  const work = weekWork(loads)
  const rand = seeded(`${block.id}:${week.start}`)
  const races = events.filter((e) => e.kind === 'race')

  const days: Day[] = dates.map((date, i) => ({
    date,
    load: loads[i],
    away: events.some((e) => e.kind === 'away' && covers(e, date)),
    busyEvent: events.some((e) => e.kind === 'busy' && covers(e, date)),
    race: races.find((r) => r.date === date),
    preRace: races.some((r) => r.priority !== 'C' && r.date === addDays(date, 1)),
    postRace: races.some((r) => r.priority === 'A' && r.date === addDays(date, -1)),
    sessions: [],
    free: loads[i].free,
  }))

  const fixedHere = fixed.filter((p) => dates.includes(p.date))
  for (const p of fixedHere) {
    const day = days.find((d) => d.date === p.date)!
    const start = p.time ? clockMin(p.time) : undefined
    const to = start != null ? start + (p.durationSec ?? 3600) / 60 : 0
    day.sessions.push({ intensity: p.intensity, sport: p.sport, from: start ?? 0, to })
    if (start != null) day.free = take(day.free, start, to)
  }

  const workScale = work.hours > 55 ? 0.8 : work.hours > 45 ? 0.9 : 1
  let slots = weekSlots(block, week, work.hours, notes)

  // Sessions already fixed in this week fill the slots they match.
  for (const p of fixedHere) {
    const idx = [slots.findIndex((s) => (p.eventId ? s.race?.id === p.eventId : s.sport === p.sport && s.intensity === p.intensity)), slots.findIndex((s) => !s.race && s.sport === p.sport)].find((i) => i >= 0)
    if (idx != null) slots.splice(idx, 1)
  }
  // Only plan what's still ahead.
  slots = slots.filter((s) => !s.race || s.race.date >= from)

  const scale = week.volume * workScale
  const used = new Set<string>()
  const filled = slots.map((s) => fill(input, week, s, rand, scale, used))
  const order: Record<Intensity, number> = { race: 0, key: 1, moderate: 2, easy: 3 }
  filled.sort((a, b) => order[a.slot.intensity] - order[b.slot.intensity] || Number(!!b.slot.long) - Number(!!a.slot.long) || b.durationSec - a.durationSec)

  const out: PlannedSession[] = []
  const trainingDays = () => new Set(days.filter((d) => d.sessions.some((s) => s.sport !== 'recovery')).map((d) => d.date)).size

  for (const f of filled) {
    const { slot } = f
    if (slot.race) {
      const day = days.find((d) => d.date === slot.race!.date)!
      day.sessions.push({ intensity: 'race', sport: slot.sport, from: 0, to: 0 })
      out.push(toPlanned(block, f, day, undefined, slot.race.priority ? `${slot.race.priority} race` : 'Race'))
      continue
    }

    let best: { day: Day; score: number; at: Placement } | undefined
    for (const day of days) {
      if (day.date < from || day.away || day.race) continue
      const recovery = slot.sport === 'recovery'
      const hard = slot.intensity === 'key'
      if (hard && (day.preRace || day.postRace)) continue
      const moving = day.sessions.filter((s) => s.sport !== 'recovery')
      if (!recovery && moving.length >= (block.doubles ? 2 : 1)) continue
      if (day.sessions.some((s) => s.sport === slot.sport)) continue
      if (!recovery && !moving.length && trainingDays() >= block.maxDays) continue

      const at = placement(day, f)
      if (!at) continue

      const neighbours = days.filter((d) => d.date === addDays(day.date, -1) || d.date === addDays(day.date, 1))
      let score = day.load.score * (hard ? 1 : slot.long ? 0.5 : 0.3)
      if (day.busyEvent) score += hard ? 150 : 40
      if (at.shortened) score += 40
      if (block.restDay != null && weekday(day.date) === block.restDay && !recovery) score += 400
      if (hard) {
        if (neighbours.some((d) => d.sessions.some((s) => s.intensity === 'key' || s.intensity === 'race'))) score += 80
        score -= day.load.freeMin / 30
      }
      if (slot.long) score -= day.load.freeMin / 6
      if (slot.intensity === 'easy' && neighbours.some((d) => d.sessions.some((s) => s.sport === slot.sport))) score += 15
      if (day.preRace) score += 30
      if (moving.length && !recovery) {
        // Doubling up: pair strength with an endurance key day (keep hard days hard), otherwise avoid.
        const pairsHard = hard && moving.every((s) => s.intensity === 'key') && (slot.sport === 'strength') !== moving.some((s) => s.sport === 'strength')
        const withKey = hard || moving.some((s) => s.intensity === 'key')
        score += pairsHard ? 10 : withKey && slot.long ? 250 : withKey ? 120 : 60
      }
      if (!best || score < best.score) best = { day, score, at }
    }

    if (!best) {
      notes.push(`Week of ${week.start} (${weekLabel(week)}): no room for ${f.title}`)
      continue
    }
    const { day, at } = best
    day.sessions.push({ intensity: slot.intensity, sport: slot.sport, from: at.start, to: at.start + at.sec / 60 })
    day.free = take(day.free, at.start, at.start + at.sec / 60)
    const oneOff = at.shortened && f.oneOff?.durationSec ? { ...f.oneOff, durationSec: at.sec } : f.oneOff
    out.push(toPlanned(block, { ...f, oneOff, durationSec: at.sec }, day, at, reasonFor(day, at, slot, prefs)))
  }
  return out
}

interface Placement {
  start: number
  sec: number
  slot: PlannedSession['slot']
  shortened: boolean
}

/** Picks a start time in the day's free time: before work if there's room, else after. */
function placement(day: Day, f: Filled): Placement | undefined {
  const need = f.durationSec / 60 + 10
  const minNeed = f.minSec / 60 + 10
  const { workStart, workEnd } = day.load
  const fits = day.free.filter(([s, e]) => e - s >= need)
  const squeezed = fits.length ? [] : day.free.filter(([s, e]) => e - s >= minNeed).sort((a, b) => b[1] - b[0] - (a[1] - a[0]))
  const windows = fits.length ? fits : squeezed
  if (!windows.length) return undefined
  const shortened = !fits.length
  const sec = shortened ? Math.floor((windows[0][1] - windows[0][0] - 10) / 5) * 5 * 60 : f.durationSec

  if (workStart == null && workEnd == null) {
    // Day off: 9am if there's room, then late afternoon (a second session), then the first gap that fits.
    const at = (t: number) => windows.find(([s, e]) => Math.max(s, t) + sec / 60 <= e && e > t)
    const nine = windows.find(([s, e]) => s <= 9 * 60 && e >= 9 * 60 + sec / 60)
    const late = !nine && day.sessions.length ? at(16 * 60) : undefined
    const start = nine ? 9 * 60 : late ? roundUp(Math.max(late[0], 16 * 60)) : roundUp(windows[0][0])
    return { start, sec, slot: 'off', shortened }
  }
  const before = windows.filter(([, e]) => workStart != null && e <= workStart)
  const after = windows.filter(([s]) => workEnd != null && s >= workEnd)
  // Hard sessions go before work when the morning allows (fresher); easy ones after, when there's room.
  const preferBefore = f.slot.intensity !== 'easy' || !after.length
  if (preferBefore && before.length) {
    const w = before.at(-1)!
    return { start: Math.max(w[0], roundDown(w[1] - sec / 60 - 10)), sec, slot: 'before', shortened }
  }
  const w = after[0] ?? windows[0]
  return { start: roundUp(w[0]), sec, slot: workStart != null && w[1] <= workStart ? 'before' : 'after', shortened }
}

const roundUp = (m: number) => Math.ceil(m / 15) * 15
const roundDown = (m: number) => Math.floor(m / 15) * 15

function reasonFor(day: Day, at: Placement, slot: Slot, prefs: PlanPrefs) {
  const l = day.load
  const parts: string[] = []
  const travel = prefs.commuteMin ? `${prefs.commuteMin}′ travel` : ''
  const gap = prefs.gapMin ? `${prefs.gapMin}′ to refuel` : ''
  if (at.slot === 'off') parts.push(l.commitments.length ? 'No work today' : 'Day off')
  else if (at.slot === 'before' && l.workStart != null) {
    const end = minClock(at.start + at.sec / 60)
    parts.push(`Before your ${minClock(l.workStart)} start: done by ${end}${gap || travel ? `, then ${[gap, travel].filter(Boolean).join(' and ')}` : ''}`)
  } else if (l.workEnd != null) {
    parts.push(`After work (finish ${minClock(l.workEnd)})${travel || gap ? `: ${[travel && `${travel} home`, gap].filter(Boolean).join(' and ')} first` : ''}`)
  }
  if (slot.intensity === 'key') parts.push(l.strain === 'low' ? 'light day for a hard session' : 'least-loaded day left for a hard session')
  if (slot.long) parts.push(at.slot === 'off' ? 'most free time for the long one' : 'long one fitted around work')
  if (l.night) parts.push('night shift nearby: kept easy where possible')
  if (at.shortened) parts.push('shortened to fit')
  if (day.busyEvent) parts.push('busy day')
  return parts.join(' · ')
}

function toPlanned(block: Block, f: Filled, day: Day, at: Placement | undefined, reason: string): PlannedSession {
  return {
    id: newId(),
    blockId: block.id,
    date: day.date,
    time: at ? minClock(at.start) : undefined,
    slot: at?.slot,
    sport: f.slot.sport,
    intensity: f.slot.intensity,
    title: f.title,
    workoutId: f.workoutId,
    oneOff: f.oneOff,
    benchmark: f.benchmark || undefined,
    eventId: f.slot.race?.id,
    durationSec: f.durationSec || undefined,
    reason,
  }
}
