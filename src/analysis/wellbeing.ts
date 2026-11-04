// Wellbeing against training load: does what you log in the daily check-in move with
// what you did in training? Each check-in is paired with the load that came before it
// (check-ins are usually done in the morning, before that day's training):
//  - the day before's load, for short-term effects (soreness, sleep, HRV the next morning);
//  - the 7-day weighted load (fatigue in the load model) up to the day before, for build-up.
// Relationships use Spearman's rank correlation, which suits 1–5 scales and doesn't let one
// huge day dominate. Nothing here claims cause: it shows what tends to go together.

import { wellnessScore } from '../log/stats'
import type { Wellbeing } from '../log/types'
import { addDays } from '../plan/dates'
import type { LoadDay } from './load'

export type MetricKey =
  | 'wellness'
  | 'sleepHours'
  | 'sleepQuality'
  | 'restingHr'
  | 'hrv'
  | 'energy'
  | 'mood'
  | 'motivation'
  | 'soreness'
  | 'fatigue'
  | 'stress'

export interface Metric {
  key: MetricKey
  label: string
  /** Which way is good for you. */
  better: 'higher' | 'lower'
  get: (w: Wellbeing) => number | undefined
  format: (v: number) => string
}

const scale = (v: number) => v.toFixed(1)

export const METRICS: Metric[] = [
  { key: 'wellness', label: 'Wellness score', better: 'higher', get: (w) => wellnessScore(w), format: scale },
  { key: 'sleepHours', label: 'Sleep', better: 'higher', get: (w) => w.sleepHours, format: (v) => `${v.toFixed(1)}h` },
  { key: 'sleepQuality', label: 'Sleep quality', better: 'higher', get: (w) => w.sleepQuality, format: scale },
  { key: 'restingHr', label: 'Resting HR', better: 'lower', get: (w) => w.restingHr, format: (v) => `${Math.round(v)}` },
  { key: 'hrv', label: 'HRV', better: 'higher', get: (w) => w.hrv, format: (v) => `${Math.round(v)}ms` },
  { key: 'energy', label: 'Energy', better: 'higher', get: (w) => w.energy, format: scale },
  { key: 'mood', label: 'Mood', better: 'higher', get: (w) => w.mood, format: scale },
  { key: 'motivation', label: 'Motivation', better: 'higher', get: (w) => w.motivation, format: scale },
  { key: 'soreness', label: 'Soreness', better: 'lower', get: (w) => w.soreness, format: scale },
  { key: 'fatigue', label: 'Tiredness', better: 'lower', get: (w) => w.fatigue, format: scale },
  { key: 'stress', label: 'Stress', better: 'lower', get: (w) => w.stress, format: scale },
]

export type Driver = 'yesterday' | 'week'

export const DRIVER_LABEL: Record<Driver, string> = {
  yesterday: 'Day before’s load',
  week: '7-day load',
}

/** Fewer pairs than this and a correlation is mostly noise, so it isn't shown. */
export const MIN_PAIRS = 10

/** A check-in with the load that led up to it. */
export interface Pair {
  date: string
  w: Wellbeing
  /** Load the day before the check-in. */
  yesterday: number
  /** 7-day weighted load up to the day before. */
  week: number
}

/**
 * Check-ins from `from` to `to` that have load history before them. Days before the first
 * logged load are left out (we don't know what was done then); after it, a day with
 * nothing logged counts as rest.
 */
export function pairUp(wellbeing: Wellbeing[], series: LoadDay[], from: string, to: string): Pair[] {
  const byDate = new Map(series.map((d) => [d.date, d]))
  const out: Pair[] = []
  for (const w of wellbeing) {
    if (w.date < from || w.date > to) continue
    const prev = byDate.get(addDays(w.date, -1))
    if (!prev) continue
    out.push({ date: w.date, w, yesterday: prev.load, week: prev.fatigue })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Ranks with ties sharing the average rank (1-based). */
export function ranks(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(values.length)
  for (let i = 0; i < order.length; ) {
    let j = i
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++
    const r = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[order[k][1]] = r
    i = j + 1
  }
  return out
}

function pearson(x: number[], y: number[]): number | undefined {
  const n = x.length
  if (n < 2) return undefined
  const mx = x.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my)
    sxx += (x[i] - mx) ** 2
    syy += (y[i] - my) ** 2
  }
  // One side never changes: there's nothing to relate.
  if (sxx === 0 || syy === 0) return undefined
  return sxy / Math.sqrt(sxx * syy)
}

/** Spearman's rank correlation, or undefined when either side is constant or n < 2. */
export function spearman(x: number[], y: number[]): number | undefined {
  return pearson(ranks(x), ranks(y))
}

export type Strength = 'none' | 'weak' | 'moderate' | 'strong'

export function strength(r: number): Strength {
  const a = Math.abs(r)
  if (a < 0.2) return 'none'
  if (a < 0.4) return 'weak'
  if (a < 0.6) return 'moderate'
  return 'strong'
}

export interface Relation {
  metric: Metric
  driver: Driver
  r: number
  n: number
  strength: Strength
  /** True when more load goes with the good direction for this metric. */
  goodWithLoad: boolean
}

/** Every metric × driver with enough pairs, strongest first. */
export function links(pairs: Pair[]): Relation[] {
  const out: Relation[] = []
  for (const metric of METRICS) {
    const rows = pairs.map((p) => ({ v: metric.get(p.w), p })).filter((x): x is { v: number; p: Pair } => x.v != null)
    if (rows.length < MIN_PAIRS) continue
    for (const driver of ['yesterday', 'week'] as Driver[]) {
      const r = spearman(
        rows.map((x) => x.p[driver]),
        rows.map((x) => x.v),
      )
      if (r == null) continue
      out.push({ metric, driver, r, n: rows.length, strength: strength(r), goodWithLoad: metric.better === 'higher' ? r > 0 : r < 0 })
    }
  }
  return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
}

/** Plain-English reading of a link, e.g. "Soreness is usually higher after heavier days". */
export function describe(l: Relation): string {
  const dir = l.r > 0 ? 'higher' : 'lower'
  const after = l.driver === 'yesterday' ? 'the morning after a bigger day' : 'when the last week has been heavier'
  const how = l.strength === 'strong' ? 'clearly' : l.strength === 'moderate' ? 'usually' : 'slightly'
  return `${l.metric.label} is ${how} ${dir} ${after}`
}

export type Band = 'rest' | 'light' | 'moderate' | 'hard'

export const BAND_LABEL: Record<Band, string> = {
  rest: 'Rest',
  light: 'Light',
  moderate: 'Moderate',
  hard: 'Hard',
}

/** Value at quantile q (0–1) of sorted numbers, interpolated. */
function quantile(sorted: number[], q: number) {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/**
 * Cut-offs for light / moderate / hard training days: thirds of this athlete's own
 * non-zero daily loads, so "hard" means hard for you.
 */
export function bandCuts(loads: number[]): [number, number] | undefined {
  const sorted = loads.filter((l) => l > 0).sort((a, b) => a - b)
  if (sorted.length < 3) return undefined
  return [quantile(sorted, 1 / 3), quantile(sorted, 2 / 3)]
}

export function bandOf(load: number, cuts: [number, number]): Band {
  if (load <= 0) return 'rest'
  if (load <= cuts[0]) return 'light'
  if (load <= cuts[1]) return 'moderate'
  return 'hard'
}

export interface BandRow {
  band: Band
  /** Mean of the metric on mornings after this kind of day; undefined if no check-ins. */
  mean?: number
  n: number
}

/**
 * The metric's average the morning after rest, light, moderate and hard days. `cuts`
 * should come from every training day in the range (not just the ones with a check-in)
 * so the bands mean the same thing for every metric.
 */
export function byBand(pairs: Pair[], metric: Metric, cuts: [number, number]): BandRow[] {
  const acc = new Map<Band, { sum: number; n: number }>()
  for (const p of pairs) {
    const v = metric.get(p.w)
    if (v == null) continue
    const b = bandOf(p.yesterday, cuts)
    const a = acc.get(b) ?? { sum: 0, n: 0 }
    a.sum += v
    a.n++
    acc.set(b, a)
  }
  return (['rest', 'light', 'moderate', 'hard'] as Band[]).map((band) => {
    const a = acc.get(band)
    return { band, n: a?.n ?? 0, mean: a ? a.sum / a.n : undefined }
  })
}
