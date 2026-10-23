import { paceSPerKm, splitSPer500 } from './format'
import type { Interval, Session, Target, TargetMetric } from './types'

/** Whether a bigger number means working harder (watts) or easier (pace, split). */
const HIGHER_IS_HARDER: Record<TargetMetric, boolean> = {
  power: true,
  hr: true,
  rate: true,
  pace: false,
  split: false,
}

export const TARGET_LABEL: Record<TargetMetric, string> = {
  power: 'Power',
  pace: 'Pace',
  split: 'Split',
  hr: 'Heart rate',
  rate: 'Rate',
}

/** A rep's value for a metric, in the same base units as Target. */
export function repValue(rep: Interval, metric: TargetMetric): number | undefined {
  switch (metric) {
    case 'power':
      return rep.avgPower
    case 'hr':
      return rep.avgHR
    case 'rate':
      return rep.avgRate
    case 'pace':
      return rep.distanceM ? paceSPerKm(rep.durationS, rep.distanceM) : undefined
    case 'split':
      return rep.distanceM ? splitSPer500(rep.durationS, rep.distanceM) : undefined
  }
}

/** hit = inside the range, under = easier than asked (missed), over = harder than asked. */
export type TargetStatus = 'hit' | 'under' | 'over'

export function checkTarget(rep: Interval): TargetStatus | undefined {
  const t = rep.target
  if (!t) return undefined
  const v = repValue(rep, t.metric)
  if (v === undefined) return undefined
  const harder = HIGHER_IS_HARDER[t.metric]
  if (t.min !== undefined && v < t.min) return harder ? 'under' : 'over'
  if (t.max !== undefined && v > t.max) return harder ? 'over' : 'under'
  return 'hit'
}

/** The metric a session's reps are best judged on when no target was set. */
export function primaryMetric(session: Session): TargetMetric {
  const targeted = session.intervals?.find((r) => r.target)?.target
  if (targeted) return targeted.metric
  if (session.intervals?.some((r) => r.avgPower)) return 'power'
  return session.sport === 'row' ? 'split' : 'pace'
}

export interface IntervalSummary {
  reps: number
  workS: number
  restS: number
  distanceM: number
  /** Time-weighted averages across work reps only. */
  avgPower?: number
  avgHR?: number
  avgRate?: number
  targeted: number
  hit: number
  /**
   * Change from the first rep to the last on the primary metric, as a
   * fraction where positive means the last rep was harder (e.g. faster).
   */
  drift?: number
}

function timeWeighted(reps: Interval[], key: 'avgPower' | 'avgHR' | 'avgRate') {
  const withVal = reps.filter((r) => r[key] !== undefined)
  const t = withVal.reduce((a, r) => a + r.durationS, 0)
  return t ? withVal.reduce((a, r) => a + r[key]! * r.durationS, 0) / t : undefined
}

export function summarise(session: Session): IntervalSummary | undefined {
  const reps = session.intervals
  if (!reps?.length) return undefined
  const statuses = reps.map(checkTarget)
  const metric = primaryMetric(session)
  const first = repValue(reps[0], metric)
  const last = repValue(reps[reps.length - 1], metric)
  let drift: number | undefined
  if (reps.length > 1 && first && last) {
    drift = (last - first) / first
    if (!HIGHER_IS_HARDER[metric]) drift = -drift
  }
  return {
    reps: reps.length,
    workS: reps.reduce((a, r) => a + r.durationS, 0),
    restS: reps.reduce((a, r) => a + (r.restS ?? 0), 0),
    distanceM: reps.reduce((a, r) => a + (r.distanceM ?? 0), 0),
    avgPower: timeWeighted(reps, 'avgPower'),
    avgHR: timeWeighted(reps, 'avgHR'),
    avgRate: timeWeighted(reps, 'avgRate'),
    targeted: statuses.filter(Boolean).length,
    hit: statuses.filter((s) => s === 'hit').length,
    drift,
  }
}

/** Short description of a target, already converted for display by the caller's formatter. */
export function describeTarget(t: Target, fmt: (v: number) => string) {
  if (t.min !== undefined && t.max !== undefined) return `${fmt(t.min)}–${fmt(t.max)}`
  const harder = HIGHER_IS_HARDER[t.metric]
  if (t.min !== undefined) return `${harder ? '≥' : 'no faster than'} ${fmt(t.min)}`
  if (t.max !== undefined) return `${harder ? '≤' : 'faster than'} ${fmt(t.max)}`
  return ''
}
