// The weekly review's rules: from what the week looked like, what to change in the weeks
// ahead. Each gives a proposal with its reason and the research it rests on (or says it's
// the coach's judgement). Nothing changes until the athlete accepts it.

import { injuryFlags, injuryTitle } from '../coach/screening'
import type { Aggravator, Injury } from '../coach/types'
import type { Sport } from '../log/types'
import { MARKER_FOR_SPORT, markerDef } from '../markers/markers'
import { addDays } from '../plan/dates'
import type { PlanWeek } from '../plan/cycle'
import type { Block, PlannedSession, ReviewProposal, WeekAdjust } from '../plan/types'
import type { TargetResult, WeekSummary } from './summary'

/** Under this share of planned time done, the next week holds rather than builds. */
export const LOW_COMPLETION = 0.6

/** Pain above this in training (out of 10) means less of what sets it off (Silbernagel et al. 2007). */
export const PAIN_LIMIT = 5

/** Next week's shifts this much above recent weeks, and at least this many hours, lighten it. */
export const WORK_JUMP = 1.25
export const WORK_MIN_HOURS = 30
/** Above this the planner already drops easy sessions by itself. */
export const WORK_PLANNER_HOURS = 45

const AGGRAVATOR_SPORTS: Partial<Record<Aggravator, Sport[]>> = {
  running: ['run'],
  impact: ['run'],
  hills: ['run'],
  'speed work': ['run'],
  cycling: ['bike'],
  swimming: ['swim'],
  rowing: ['row', 'erg'],
  lifting: ['strength'],
}

/** Sports in the block that an injury's triggers point to. */
export function sportsFor(i: Pick<Injury, 'aggravatedBy'>, block?: Block): Sport[] {
  const all = new Set(i.aggravatedBy.flatMap((a) => AGGRAVATOR_SPORTS[a] ?? []))
  return [...all].filter((s) => !block || block.sports.some((b) => b.sport === s))
}

export interface NiggleAnswer {
  injury: Injury
  /** Settled by the next morning after training. */
  settled?: boolean
  /** Worse than last week. */
  worse?: boolean
}

export interface RuleInput {
  summary: WeekSummary
  /** The week before, for "two weeks in a row" and "two key sessions in a row". */
  previous?: WeekSummary
  block?: Block
  /** The block's weeks (blockWeeks), so the next week's kind and volume are known. */
  weeks: PlanWeek[]
  planned: PlannedSession[]
  /** Every injury in the coach profile, with this review's answer already merged in. */
  injuries: Injury[]
  niggle?: NiggleAnswer
  /** Work hours next week, and in the weeks before (for "heavier than usual"). */
  work?: { next: number; recent: number[] }
  /** Sessions are only moved to days after this. */
  today?: string
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const hours = (sec: number) => `${(sec / 3600).toFixed(1)}h`
const SPORT_NAME: Partial<Record<Sport, string>> = { run: 'running', bike: 'cycling', swim: 'swimming', row: 'on-water rowing', erg: 'erg', strength: 'strength' }
const names = (ss: Sport[]) => ss.map((s) => SPORT_NAME[s] ?? s).join(' and ')

export function reviewRules(input: RuleInput): ReviewProposal[] {
  const { summary: w, previous, block, weeks, planned, injuries, niggle, work, today } = input
  const out: ReviewProposal[] = []
  const nextStart = addDays(w.start, 7)
  const thisWeek = weeks.find((x) => x.start === w.start)
  const next = weeks.find((x) => x.start === nextStart)
  const nextIsBuild = next?.kind === 'build'
  const adjust = (adj: WeekAdjust) => (next ? { kind: 'adjustWeek' as const, week: next.start, adjust: adj } : undefined)
  /** Something already makes next week easy, so volume rules don't stack on top. */
  let easier = false
  /** Sports with no hard work next week once these proposals are taken (missed sessions don't move there). */
  const softNext = new Set<Sport | 'all'>()

  // ---- Ill ----------------------------------------------------------------------------------
  if (w.illDays.length) {
    easier = true
    softNext.add('all')
    out.push({
      id: 'ill',
      rule: 'ill',
      title: 'Next week easy only',
      reason: `You ticked ill on ${w.illDays.length} day${w.illDays.length === 1 ? '' : 's'}. Next week keeps its sessions but none of them hard, so you build back from the week after.`,
      findings: [],
      judgement: true,
      change: adjust({ easyOnly: true }),
    })
  }

  // ---- Niggles ------------------------------------------------------------------------------
  // Any injury the screening flags "see a physio first" keeps its sports out, week after week, until cleared.
  for (const i of injuries) {
    if (i.status === 'past' || !injuryFlags(i).some((f) => f.level === 'stop')) continue
    const sports = sportsFor(i, block)
    sports.forEach((x) => softNext.add(x))
    out.push({
      id: `niggle-stop-${i.id}`,
      rule: 'niggle',
      title: sports.length ? `No ${names(sports)} next week: see a physio first` : `${injuryTitle(i)}: see a physio first`,
      reason: `${injuryFlags(i).find((f) => f.level === 'stop')!.text} Cross-train with what doesn't hurt.`,
      findings: ['pain-monitoring'],
      change: sports.length ? adjust({ drop: sports }) : undefined,
      link: { to: '/plan/coach', label: 'Update the injury' },
    })
  }
  if (niggle && !injuryFlags(niggle.injury).some((f) => f.level === 'stop')) {
    const i = niggle.injury
    const pain = i.painInSport ?? 0
    const why = [pain > PAIN_LIMIT && `pain of ${pain}/10 in training`, niggle.settled === false && 'not settled by the next morning', niggle.worse && 'worse than last week'].filter(Boolean)
    if (why.length) {
      const sports = sportsFor(i, block)
      sports.forEach((x) => softNext.add(x))
      out.push({
        id: `niggle-less-${i.id}`,
        rule: 'niggle',
        title: sports.length ? `Less ${names(sports)} next week` : 'Ease off what sets it off',
        reason: `${injuryTitle(i)}: ${why.join(', ')}. Pain up to about 5/10 that settles by the next morning and doesn't build week to week is fine to train with; past that, reduce what provokes it.`,
        findings: ['pain-monitoring'],
        change: sports.length ? adjust({ less: sports }) : undefined,
      })
    }
  }

  // ---- Struggling ---------------------------------------------------------------------------
  const struggling = (w.lowDays.length >= 3 && w.rpeHigh.length > 0) || w.lowDays.length >= 5
  if (struggling && !easier) {
    easier = true
    softNext.add('all')
    const facts = [
      `${w.lowDays.length} check-ins worse than your ${w.baseline === 'own' ? 'usual' : 'healthy range'}`,
      w.rpeHigh.length && `${w.rpeHigh.length} easy session${w.rpeHigh.length === 1 ? '' : 's'} felt harder than planned`,
    ]
      .filter(Boolean)
      .join(', and ')
    const deloadLater = next && weeks.some((x) => x.start > next.start && x.kind === 'deload')
    if (next && nextIsBuild && deloadLater) {
      out.push({
        id: 'struggling',
        rule: 'struggling',
        title: 'Bring the deload forward to next week',
        reason: `${facts}. A lighter week now, rather than pushing on to the planned deload; the cycle restarts after it.`,
        findings: ['sleep'],
        judgement: true,
        change: { kind: 'weekKind', week: next.start, to: 'deload' },
      })
    } else if (next && nextIsBuild) {
      out.push({ id: 'struggling', rule: 'struggling', title: 'Cut next week by 20%', reason: `${facts}. A lighter week before building again.`, findings: ['sleep'], judgement: true, change: adjust({ scale: 80 }) })
    } else {
      out.push({ id: 'struggling', rule: 'struggling', title: 'Next week is already lighter', reason: `${facts}. Next week is ${next ? `a ${next.kind} week` : 'outside the block'}, so nothing more to change; protect your sleep.`, findings: ['sleep'], judgement: true })
    }
  }

  // ---- Low completion -----------------------------------------------------------------------
  const low = (x: WeekSummary) => (x.completion != null && x.completion < LOW_COMPLETION) || (x.keyDue > 0 && x.keyMissed.length * 2 >= x.keyDue)
  if (low(w)) {
    const facts = [w.completion != null && `${pct(w.completion)} of planned time done (${hours(w.doneSec)} of ${hours(w.plannedSec)})`, w.keyMissed.length && `${w.keyMissed.length} of ${w.keyDue} key sessions missed`]
      .filter(Boolean)
      .join(', ')
    if (previous && low(previous)) {
      out.push({
        id: 'low-twice',
        rule: 'low-completion',
        title: 'Re-run the coach for a smaller block',
        reason: `Two weeks running under plan (${facts} this week). The block asks more than your weeks allow right now; a block built from what you're actually doing will progress better.`,
        findings: ['run-progression'],
        judgement: true,
        link: { to: '/plan/coach/plan', label: 'Build my plan' },
      })
    }
    if (!easier && next && nextIsBuild && thisWeek && next.volume > thisWeek.volume) {
      const scale = Math.round((thisWeek.volume / next.volume) * 100)
      out.push({
        id: 'low-completion',
        rule: 'low-completion',
        title: 'Repeat this week’s volume next week',
        reason: `${facts}. Next week holds at this week's volume instead of building on work that wasn't done.`,
        findings: ['run-progression'],
        judgement: true,
        change: adjust({ scale }),
      })
    }
  }

  // ---- Missed key sessions ------------------------------------------------------------------
  const benchmarks = w.keyMissed.filter((r) => r.planned.benchmark)
  for (const r of benchmarks) {
    const p = r.planned
    // The same sport's next key session in a build week, not logged or set by hand.
    const builds = new Set(weeks.filter((x) => x.kind === 'build' && x.start > w.start && !(x.start === nextStart && (softNext.has('all') || softNext.has(p.sport)))).map((x) => x.start))
    const after = today && today > w.end ? today : w.end
    const target = planned
      .filter((q) => q.sport === p.sport && q.intensity === 'key' && !q.locked && !q.benchmark && q.date > after && (!block || q.blockId === block.id))
      .filter((q) => weeks.some((x) => builds.has(x.start) && q.date >= x.start && q.date <= addDays(x.start, 6)))
      .sort((a, b) => a.date.localeCompare(b.date))[0]
    out.push({
      id: `move-${p.id}`,
      rule: 'missed-key',
      title: target ? `Move “${p.title}” to ${new Date(`${target.date}T12:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}` : `“${p.title}” not made up`,
      reason: target
        ? `A benchmark you compare each cycle, so it replaces that day's ${target.title} rather than being squeezed into the days left.`
        : 'No later build-week key session to put it in, so it waits for the next cycle.',
      findings: [],
      judgement: true,
      change: target ? { kind: 'moveSession', fromId: p.id, toId: target.id } : undefined,
    })
  }
  const others = w.keyMissed.filter((r) => !r.planned.benchmark)
  if (others.length) {
    out.push({
      id: 'missed-key',
      rule: 'missed-key',
      title: `${others.length === 1 ? 'Missed key session' : `${others.length} missed key sessions`} not made up`,
      reason: `${others.map((r) => r.planned.title).join(', ')}: the weeks ahead carry on as planned rather than squeezing an extra hard session in.`,
      findings: [],
      judgement: true,
    })
  }

  // ---- Targets ------------------------------------------------------------------------------
  const easy = w.keyTargets.filter((t) => t.over / t.targeted >= 0.6 && t.result.logged?.rpe != null && t.result.plannedRpe != null && t.result.logged.rpe < t.result.plannedRpe)
  for (const sport of new Set(easy.map((t) => t.result.planned.sport))) {
    const kind = MARKER_FOR_SPORT[sport]
    out.push({
      id: `targets-easy-${sport}`,
      rule: 'targets-easy',
      title: kind ? `Re-test your ${markerDef(kind).label.toLowerCase()}` : 'Targets look easy',
      reason: 'Most reps went faster than the target at a lower effort than planned. Your fitness has probably moved on: re-test so the targets catch up, rather than adding volume.',
      findings: [],
      judgement: true,
      link: { to: '/log/markers', label: 'Fitness markers' },
    })
  }
  const missedMost = (t: TargetResult) => t.hit / t.targeted < 0.5 && t.under > t.over
  const lastKey = [...(previous?.keyTargets ?? []), ...w.keyTargets]
  for (const sport of new Set(w.keyTargets.map((t) => t.result.planned.sport))) {
    const two = lastKey.filter((t) => t.result.planned.sport === sport).slice(-2)
    if (two.length < 2 || !two.every(missedMost)) continue
    const kind = MARKER_FOR_SPORT[sport]
    out.push({
      id: `targets-hard-${sport}`,
      rule: 'targets-hard',
      title: kind ? `Check your ${markerDef(kind).label.toLowerCase()}` : 'Targets look too hard',
      reason: 'Two key sessions in a row mostly short of target. Before anything else: re-test, as the marker may be out of date, or take an easier week if you are run down.',
      findings: [],
      judgement: true,
      link: { to: '/log/markers', label: 'Fitness markers' },
    })
  }

  // ---- Work -----------------------------------------------------------------------------------
  if (work && next) {
    const usual = work.recent.filter((h) => h > 0)
    const avg = usual.length ? usual.reduce((a, h) => a + h, 0) / usual.length : 0
    if (avg && work.next >= avg * WORK_JUMP && work.next >= WORK_MIN_HOURS) {
      if (work.next > WORK_PLANNER_HOURS) {
        out.push({
          id: 'work',
          rule: 'work',
          title: 'Big work week: already lightened',
          reason: `${Math.round(work.next)}h of shifts next week against your usual ${Math.round(avg)}h. The planner already drops easy sessions above ${WORK_PLANNER_HOURS}h, so nothing more to change.`,
          findings: ['plan-around-work'],
        })
      } else if (!easier) {
        out.push({
          id: 'work',
          rule: 'work',
          title: 'Lighten next week for work',
          reason: `${Math.round(work.next)}h of shifts next week against your usual ${Math.round(avg)}h. Work counts as load too, so next week's training comes down 10%.`,
          findings: ['plan-around-work'],
          change: adjust({ scale: 90 }),
        })
      }
    }
  }

  return out
}
