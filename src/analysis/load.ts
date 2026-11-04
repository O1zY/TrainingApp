// Training load over time from session-RPE (RPE × minutes). Fatigue and fitness are
// exponentially weighted averages of daily load (7 and 42 days), as in the
// Banister / Coggan fitness-fatigue model; form is fitness minus fatigue.

import { sessionLoad } from '../log/stats'
import type { Session } from '../log/types'
import { addDays, daysBetween } from '../plan/dates'

export const FATIGUE_DAYS = 7
export const FITNESS_DAYS = 42

export interface LoadDay {
  date: string
  load: number
  /** 7-day exponentially weighted load (acute). */
  fatigue: number
  /** 42-day exponentially weighted load (chronic). */
  fitness: number
}

/** Sessions that count towards analysis: done, and not a multisport transition. */
export const counted = (s: Session) => s.status === 'completed' && s.sport !== 'transition'

export function dailyLoad(sessions: Session[]) {
  const byDay = new Map<string, number>()
  for (const s of sessions) {
    if (!counted(s)) continue
    const l = sessionLoad(s)
    if (l) byDay.set(s.date, (byDay.get(s.date) ?? 0) + l)
  }
  return byDay
}

/**
 * Every day from the first logged load to `to`, with fatigue and fitness carried
 * forward. Both start from zero, so fitness reads low for the first few weeks.
 */
export function loadSeries(sessions: Session[], to: string): LoadDay[] {
  const byDay = dailyLoad(sessions)
  const first = [...byDay.keys()].sort()[0]
  if (!first || first > to) return []
  const ka = 1 - Math.exp(-1 / FATIGUE_DAYS)
  const kc = 1 - Math.exp(-1 / FITNESS_DAYS)
  const out: LoadDay[] = []
  let fatigue = 0
  let fitness = 0
  const n = daysBetween(first, to)
  for (let i = 0; i <= n; i++) {
    const date = addDays(first, i)
    const load = byDay.get(date) ?? 0
    fatigue += (load - fatigue) * ka
    fitness += (load - fitness) * kc
    out.push({ date, load, fatigue, fitness })
  }
  return out
}

export type RatioBand = 'low' | 'good' | 'caution' | 'high'

/** Acute:chronic bands (Gabbett 2016): 0.8–1.3 is the usual sweet spot, above 1.5 a spike. */
export function ratioBand(ratio: number): RatioBand {
  if (ratio < 0.8) return 'low'
  if (ratio <= 1.3) return 'good'
  if (ratio <= 1.5) return 'caution'
  return 'high'
}

export const RATIO_LABEL: Record<RatioBand, string> = {
  low: 'Below usual',
  good: 'In the sweet spot',
  caution: 'Building fast',
  high: 'Spike',
}

/** Completed sessions in the range that have a duration but no RPE, so add no load. */
export const missingRpe = (sessions: Session[], from: string, to: string) =>
  sessions.filter((s) => counted(s) && s.date >= from && s.date <= to && s.durationSec && !s.rpe).length
