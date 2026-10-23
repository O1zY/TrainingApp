import type { Units } from '../settings/SettingsContext'
import { PACE_LABEL, formatPace, isSpeed, paceFromBase, paceKind } from './format'
import { pieceWatts } from './stats'
import type { Aim, Piece, Session, Sport, Target, TargetMetric } from './types'

// Grading reps (and steady sessions) against what they were meant to be.
// A rep is on target, harder than asked (amber), or missed (red, deeper the further off).

/** Whether a bigger number means working harder. Pace is s/km, so lower is harder. */
const HIGHER_IS_HARDER: Record<TargetMetric, boolean> = { pace: false, power: true, hr: true, rate: true }

export const TARGET_METRICS: { value: TargetMetric; label: string }[] = [
  { value: 'pace', label: 'Pace' },
  { value: 'power', label: 'Watts' },
  { value: 'hr', label: 'HR' },
  { value: 'rate', label: 'Rate' },
]

/**
 * How far off, as a fraction of the bound, counts as fully missed. Rowing splits
 * are tighter than run pace because a second per 500m is a lot; HR and rate drift
 * naturally. Fixed for now; the coaching section will make these adapt (see docs/SPEC.md).
 */
function fullMiss(metric: TargetMetric, sport: Sport) {
  if (metric === 'pace') return sport === 'row' || sport === 'erg' ? 0.02 : 0.03
  return metric === 'rate' ? 0.07 : 0.05
}

export type TargetStatus = 'hit' | 'over' | 'under'

export interface Assessment {
  status: TargetStatus
  /** How far past the nearest bound, as a fraction of it. 0 when on target. */
  off: number
  /** 0–1: how bad a miss is, so slightly off reads mild and well off reads severe. */
  severity: number
}

export function assess(value: number, t: Target, sport: Sport): Assessment {
  let bound: number | undefined
  if (t.min != null && value < t.min) bound = t.min
  else if (t.max != null && value > t.max) bound = t.max
  if (bound == null) return { status: 'hit', off: 0, severity: 0 }
  const off = Math.abs(value - bound) / bound
  const status = value > bound === HIGHER_IS_HARDER[t.metric] ? 'over' : 'under'
  return { status, off, severity: Math.min(1, off / fullMiss(t.metric, sport)) }
}

/** A rep's or session's value for a metric, in target base units. */
export function actualValue(x: Pick<Piece, 'distanceM' | 'durationSec' | 'hrAvg' | 'rate' | 'watts'>, metric: TargetMetric, sport: Sport) {
  switch (metric) {
    case 'pace':
      return x.distanceM && x.durationSec ? (x.durationSec / x.distanceM) * 1000 : undefined
    case 'power':
      return pieceWatts({ id: '', ...x }, sport)
    case 'hr':
      return x.hrAvg
    case 'rate':
      return x.rate
  }
}

export function checkTarget(x: Piece | Session, sport: Sport): Assessment | undefined {
  if (!x.target) return undefined
  const v = actualValue(x, x.target.metric, sport)
  return v == null ? undefined : assess(v, x.target, sport)
}

// ---- Heart-rate zones -------------------------------------------------------

/** Zones are stored as the top bpm of zones 1–4; zone 5 runs to max. */
export function zoneRange(zone: number, tops: number[]): Target {
  return { metric: 'hr', min: zone > 1 ? tops[zone - 2] + 1 : undefined, max: zone < 5 ? tops[zone - 1] : undefined }
}

export function zoneOf(bpm: number, tops: number[]) {
  const i = tops.findIndex((top) => bpm <= top)
  return i === -1 ? 5 : i + 1
}

export function checkZone(x: Pick<Aim, 'hrZone'> & { hrAvg?: number }, tops: number[], sport: Sport): Assessment | undefined {
  if (!x.hrZone || x.hrAvg == null) return undefined
  return assess(x.hrAvg, zoneRange(x.hrZone, tops), sport)
}

// ---- Colours ------------------------------------------------------------------

/** CSS colour for a result: green on target, amber harder than asked, red shading light→deep for misses. */
export function statusColor(a: Assessment | undefined): string | undefined {
  if (!a) return undefined
  if (a.status === 'hit') return 'var(--hit)'
  if (a.status === 'over') return 'var(--over)'
  const pct = Math.round(25 + a.severity * 75)
  return `color-mix(in oklab, var(--miss-far) ${pct}%, var(--miss-near))`
}

export const STATUS_LABEL: Record<TargetStatus, string> = { hit: 'On target', over: 'Harder than target', under: 'Missed' }

// ---- Describing targets -------------------------------------------------------

function unitFor(metric: TargetMetric, sport: Sport, units: Units) {
  if (metric === 'pace') {
    const kind = paceKind(sport, units)
    return kind ? PACE_LABEL[kind] : '/km'
  }
  if (metric === 'power') return 'W'
  if (metric === 'hr') return 'bpm'
  return sport === 'bike' ? 'rpm' : 'spm'
}

/** Base value → what the user types and reads, e.g. s/km → split /500m. */
export function displayValue(metric: TargetMetric, v: number, sport: Sport, units: Units): number {
  const kind = paceKind(sport, units)
  return metric === 'pace' && kind ? paceFromBase(kind, v) : v
}

export function formatTargetValue(metric: TargetMetric, v: number, sport: Sport, units: Units) {
  const kind = paceKind(sport, units)
  if (metric === 'pace' && kind) return formatPace(kind, paceFromBase(kind, v))
  return String(Math.round(v))
}

const suffix = (unit: string) => (unit.startsWith('/') || unit === 'W' ? unit : ` ${unit}`)

export function describeTarget(t: Target, sport: Sport, units: Units): string {
  const unit = suffix(unitFor(t.metric, sport, units))
  const f = (v: number) => formatTargetValue(t.metric, v, sport, units)
  const kind = paceKind(sport, units)
  if (t.min != null && t.max != null) {
    // Speed shows the larger s/km as the smaller number, so flip the order.
    const [a, b] = t.metric === 'pace' && kind && isSpeed(kind) ? [t.max, t.min] : [t.min, t.max]
    return `${f(a)}–${f(b)}${unit}`
  }
  const shown = `${f((t.min ?? t.max)!)}${unit}`
  if (t.metric === 'pace') return `${shown} or faster`
  return t.min != null ? `${shown} or more` : `${shown} or less`
}

/** One-line description of an aim: target · zone · rate. */
export function describeAim(a: Aim, sport: Sport, units: Units): string {
  return [a.target && describeTarget(a.target, sport, units), a.hrZone && `Z${a.hrZone}`, a.targetRate && `r${a.targetRate}`].filter(Boolean).join(' · ')
}

/**
 * Builds a target from two typed values in display units. With one value it is a
 * one-sided target: pace means "this or faster", anything else "at least this".
 */
export function targetFromInputs(metric: TargetMetric, a: number | undefined, b: number | undefined): Target | undefined {
  const vals = [a, b].filter((v): v is number => v != null && v > 0)
  if (!vals.length) return undefined
  if (vals.length === 2) return { metric, min: Math.min(...vals), max: Math.max(...vals) }
  return metric === 'pace' ? { metric, max: vals[0] } : { metric, min: vals[0] }
}

// ---- Session summary ------------------------------------------------------------

export interface TargetSummary {
  targeted: number
  hit: number
  zoneTargeted: number
  zoneHit: number
  /** First rep → last rep on the main metric; positive means the last was harder. */
  drift?: number
  driftMetric?: TargetMetric
}

export function summariseTargets(pieces: Piece[], sport: Sport, tops: number[]): TargetSummary {
  const t = pieces.map((p) => checkTarget(p, sport)).filter((a): a is Assessment => !!a)
  const z = pieces.map((p) => checkZone(p, tops, sport)).filter((a): a is Assessment => !!a)
  const metric: TargetMetric = pieces.find((p) => p.target)?.target?.metric ?? (sport === 'bike' && pieces.some((p) => p.watts) ? 'power' : 'pace')
  let drift: number | undefined
  if (pieces.length > 1) {
    const first = actualValue(pieces[0], metric, sport)
    const last = actualValue(pieces[pieces.length - 1], metric, sport)
    if (first && last) drift = ((last - first) / first) * (HIGHER_IS_HARDER[metric] ? 1 : -1)
  }
  return { targeted: t.length, hit: t.filter((a) => a.status === 'hit').length, zoneTargeted: z.length, zoneHit: z.filter((a) => a.status === 'hit').length, drift, driftMetric: metric }
}
