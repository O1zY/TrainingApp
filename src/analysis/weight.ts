// Body-weight trend from the daily check-ins. Single weigh-ins swing by a kilo or more with
// water, food and timing, so the 7-day average is the number to read; the raw points are
// kept on the chart behind it.

import { addDays, daysBetween } from '../plan/dates'
import type { Wellbeing } from '../log/types'

export interface WeightPoint {
  date: string
  kg: number
  /** Mean of the weigh-ins in the 7 days up to and including this date. */
  avgKg: number
}

export const AVERAGE_DAYS = 7

/** Every check-in with a weight, oldest first, each with its trailing 7-day average. */
export function weightSeries(wellbeing: Pick<Wellbeing, 'date' | 'weightKg'>[]): WeightPoint[] {
  const entries = wellbeing
    .filter((w): w is { date: string; weightKg: number } => w.weightKg != null && w.weightKg > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  return entries.map((e, i) => {
    const from = addDays(e.date, -(AVERAGE_DAYS - 1))
    const window: number[] = []
    for (let j = i; j >= 0 && entries[j].date >= from; j--) window.push(entries[j].weightKg)
    return { date: e.date, kg: e.weightKg, avgKg: window.reduce((a, b) => a + b, 0) / window.length }
  })
}

/**
 * Change in the 7-day average over the last `days` days: the latest average against the average
 * on or just before that many days earlier. Undefined until the series reaches back that far.
 */
export function changeOver(series: WeightPoint[], days: number): number | undefined {
  const last = series.at(-1)
  if (!last) return undefined
  const target = addDays(last.date, -days)
  const before = [...series].reverse().find((p) => p.date <= target)
  if (!before) return undefined
  // A reading from far before the target date says nothing about it: allow a week of slack.
  if (daysBetween(before.date, target) > 7) return undefined
  return last.avgKg - before.avgKg
}
