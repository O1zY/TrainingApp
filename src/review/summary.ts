// What a training week actually looked like next to its plan: the numbers a weekly review
// shows, and the facts its rules work from. Pure, so it can be tested with made-up weeks.

import { counted, loadSeries } from '../analysis/load'
import { sessionLoad } from '../log/stats'
import { checkTarget } from '../log/targets'
import type { Session, Wellbeing, Workout } from '../log/types'
import { addDays } from '../plan/dates'
import { plannedWorkout } from '../plan/planned'
import type { PlannedSession, ReviewSnapshot } from '../plan/types'

export type Outcome = 'done' | 'moved' | 'skipped' | 'missed' | 'upcoming'

export interface SessionResult {
  planned: PlannedSession
  outcome: Outcome
  logged?: Session
  /** The RPE the plan asked for, from its workout. */
  plannedRpe?: number
}

/** How a key session's targeted reps went. */
export interface TargetResult {
  result: SessionResult
  targeted: number
  hit: number
  over: number
  under: number
}

/** A check-in that was off the athlete's own normal, and why. */
export interface LowDay {
  date: string
  reasons: string[]
}

export interface WeekSummary {
  start: string
  end: string
  results: SessionResult[]
  plannedSec: number
  /** Logged time of planned sessions done (moved ones count). */
  doneSec: number
  /** Logged time of sessions that weren't in the plan. */
  extraSec: number
  completion?: number
  keyDue: number
  keyDone: number
  keyMissed: SessionResult[]
  load: number
  fitness: number
  fatigue: number
  /** Acute:chronic ratio, for information only (finding no-acwr-rules). */
  ratio?: number
  checkins: Wellbeing[]
  lowDays: LowDay[]
  /** Whether "normal" came from the athlete's own last 4 weeks (7+ check-ins) or fixed cut-offs. */
  baseline: 'own' | 'fixed'
  illDays: string[]
  /** Injury notes typed in check-ins this week. */
  injuryNotes: string[]
  /** Easy sessions logged at least 2 RPE points harder than planned. */
  rpeHigh: SessionResult[]
  keyTargets: TargetResult[]
}

// ---- Check-ins against the athlete's own normal ------------------------------------------

type Measure = 'sleepHours' | 'sleepQuality' | 'energy' | 'fatigue' | 'soreness'

const MEASURES: { key: Measure; label: string; worse: 'lower' | 'higher'; floor: number; fixed: number }[] = [
  { key: 'sleepHours', label: 'short sleep', worse: 'lower', floor: 0.75, fixed: 6 },
  { key: 'sleepQuality', label: 'poor sleep', worse: 'lower', floor: 1, fixed: 2 },
  { key: 'energy', label: 'low energy', worse: 'lower', floor: 1, fixed: 2 },
  { key: 'fatigue', label: 'tired', worse: 'higher', floor: 1, fixed: 4 },
  { key: 'soreness', label: 'sore', worse: 'higher', floor: 1, fixed: 4 },
]

const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length
const sd = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1))
}

/** Check-ins needed in the 4 weeks before for "normal" to be the athlete's own. */
export const MIN_BASELINE = 7

/**
 * Days whose check-in was clearly worse than normal on sleep, energy, tiredness or soreness.
 * Normal is the athlete's own last 4 weeks when there are enough check-ins: worse by more than
 * one standard deviation (and at least ¾h of sleep or one point on a scale). Otherwise fixed
 * cut-offs: under 6h sleep, sleep quality or energy 2 or less, tiredness or soreness 4 or more.
 */
export function lowDays(week: Wellbeing[], before: Wellbeing[]): { days: LowDay[]; baseline: 'own' | 'fixed' } {
  const own = before.length >= MIN_BASELINE
  const norms = new Map(
    MEASURES.map((m) => {
      const xs = before.map((w) => w[m.key]).filter((v): v is number => v != null)
      return [m.key, xs.length >= MIN_BASELINE ? { mean: mean(xs), spread: Math.max(sd(xs), m.floor) } : undefined]
    }),
  )
  const days: LowDay[] = []
  for (const w of week) {
    const reasons = MEASURES.filter((m) => {
      const v = w[m.key]
      if (v == null) return false
      const n = own ? norms.get(m.key) : undefined
      if (n) return m.worse === 'lower' ? v < n.mean - n.spread : v > n.mean + n.spread
      if (m.key === 'sleepHours') return v < m.fixed
      return m.worse === 'lower' ? v <= m.fixed : v >= m.fixed
    }).map((m) => m.label)
    if (reasons.length) days.push({ date: w.date, reasons })
  }
  return { days, baseline: own ? 'own' : 'fixed' }
}

// ---- The week ---------------------------------------------------------------------------

export interface SummaryInput {
  start: string
  /** Planned sessions of every block (filtered to the week here). */
  planned: PlannedSession[]
  sessions: Session[]
  wellbeing: Wellbeing[]
  workouts: Workout[]
}

export function outcomeOf(p: PlannedSession, logged: Session | undefined, end: string): Outcome {
  if (logged) return logged.date === p.date ? 'done' : 'moved'
  if (p.skipped) return 'skipped'
  return p.date <= end ? 'missed' : 'upcoming'
}

export function summariseWeek({ start, planned, sessions, wellbeing, workouts }: SummaryInput): WeekSummary {
  const end = addDays(start, 6)
  const inWeek = (d: string) => d >= start && d <= end
  const byPlan = new Map(sessions.filter((s) => s.planId && counted(s)).map((s) => [s.planId!, s]))

  const results: SessionResult[] = planned
    .filter((p) => inWeek(p.date))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => {
      const logged = byPlan.get(p.id)
      return { planned: p, logged, outcome: outcomeOf(p, logged, end), plannedRpe: plannedWorkout(p, workouts)?.rpe }
    })

  const due = results.filter((r) => r.planned.intensity !== 'race' || r.logged)
  const plannedSec = due.filter((r) => !r.planned.skipped || r.logged).reduce((a, r) => a + (r.planned.durationSec ?? 0), 0)
  const doneSec = due.reduce((a, r) => a + (r.logged?.durationSec ?? 0), 0)
  const planIds = new Set(results.map((r) => r.planned.id))
  const extraSec = sessions.filter((s) => counted(s) && inWeek(s.date) && (!s.planId || !planIds.has(s.planId))).reduce((a, s) => a + (s.durationSec ?? 0), 0)

  const key = results.filter((r) => r.planned.intensity === 'key')
  const keyMissed = key.filter((r) => r.outcome === 'missed' || r.outcome === 'skipped')

  const series = loadSeries(sessions, end)
  const last = series.at(-1)
  const load = sessions.filter((s) => counted(s) && inWeek(s.date)).reduce((a, s) => a + (sessionLoad(s) ?? 0), 0)

  const checkins = wellbeing.filter((w) => inWeek(w.date)).sort((a, b) => a.date.localeCompare(b.date))
  const before = wellbeing.filter((w) => w.date >= addDays(start, -28) && w.date < start)
  const low = lowDays(checkins, before)

  const rpeHigh = results.filter((r) => r.planned.intensity === 'easy' && r.logged?.rpe != null && r.plannedRpe != null && r.logged.rpe >= r.plannedRpe + 2)

  const keyTargets: TargetResult[] = key
    .filter((r) => r.logged?.pieces?.some((p) => p.target))
    .map((r) => {
      const checks = r.logged!.pieces!.map((p) => checkTarget(p, r.logged!.sport)).filter((a) => !!a)
      return {
        result: r,
        targeted: checks.length,
        hit: checks.filter((a) => a.status === 'hit').length,
        over: checks.filter((a) => a.status === 'over').length,
        under: checks.filter((a) => a.status === 'under').length,
      }
    })
    .filter((t) => t.targeted > 0)

  return {
    start,
    end,
    results,
    plannedSec,
    doneSec,
    extraSec,
    completion: plannedSec ? doneSec / plannedSec : undefined,
    keyDue: key.filter((r) => r.outcome !== 'upcoming').length,
    keyDone: key.filter((r) => r.logged).length,
    keyMissed,
    load,
    fitness: last?.fitness ?? 0,
    fatigue: last?.fatigue ?? 0,
    ratio: last && last.fitness > 0 ? last.fatigue / last.fitness : undefined,
    checkins,
    lowDays: low.days,
    baseline: low.baseline,
    illDays: checkins.filter((w) => w.illness).map((w) => w.date),
    injuryNotes: checkins.map((w) => w.injury?.trim()).filter((x): x is string => !!x),
    rpeHigh,
    keyTargets,
  }
}

export function snapshotOf(s: WeekSummary): ReviewSnapshot {
  const count = (o: Outcome) => s.results.filter((r) => r.outcome === o).length
  return {
    planned: s.results.length,
    done: count('done') + count('moved'),
    missed: count('missed'),
    skipped: count('skipped'),
    moved: count('moved'),
    plannedSec: s.plannedSec,
    doneSec: s.doneSec,
    keyDue: s.keyDue,
    keyDone: s.keyDone,
    load: Math.round(s.load),
    fitness: Math.round(s.fitness),
    fatigue: Math.round(s.fatigue),
    checkins: s.checkins.length,
    lowDays: s.lowDays.length,
  }
}
