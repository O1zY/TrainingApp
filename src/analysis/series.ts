import { addDays, weekStart } from '../plan/dates'
import type { Session, Sport } from '../log/types'

// Shared pieces for the analysis: which sessions count, how sports group into
// chart series, and the weeks a date range covers.

/** Chart series. Erg and on-water share rowing; transitions are left out. */
export type Group = 'row' | 'run' | 'swim' | 'bike' | 'strength' | 'recovery' | 'other'

/** Stacking order, checked for colour-blind separation between neighbours (see docs/SPEC.md). */
export const GROUPS: { key: Group; label: string; color: string }[] = [
  { key: 'row', label: 'Rowing', color: 'var(--chart-row)' },
  { key: 'run', label: 'Run', color: 'var(--chart-run)' },
  { key: 'swim', label: 'Swim', color: 'var(--chart-swim)' },
  { key: 'bike', label: 'Bike', color: 'var(--chart-bike)' },
  { key: 'strength', label: 'Strength', color: 'var(--chart-strength)' },
  { key: 'recovery', label: 'Recovery', color: 'var(--chart-recovery)' },
  { key: 'other', label: 'Other', color: 'var(--chart-other)' },
]

export function groupOf(sport: Sport): Group | undefined {
  if (sport === 'transition') return undefined
  if (sport === 'row' || sport === 'erg') return 'row'
  return sport
}

/** Completed sessions, optionally one group only. */
export function counted(sessions: Session[], group?: Group) {
  return sessions.filter((s) => s.status === 'completed' && groupOf(s.sport) && (!group || groupOf(s.sport) === group))
}

export const RANGES = [
  { value: '4', label: '4 wk' },
  { value: '12', label: '12 wk' },
  { value: '26', label: '6 mo' },
  { value: '52', label: '1 yr' },
] as const

export type RangeValue = (typeof RANGES)[number]['value']

export interface Range {
  /** Week starts, oldest first; the last is this week. */
  weeks: string[]
  from: string
  to: string
}

export function rangeOf(weeksBack: number, today: string, weekStartsOn: 0 | 1): Range {
  const last = weekStart(today, weekStartsOn)
  const weeks = Array.from({ length: weeksBack }, (_, i) => addDays(last, (i - weeksBack + 1) * 7))
  return { weeks, from: weeks[0], to: today }
}

export const inWeek = (date: string, start: string) => date >= start && date < addDays(start, 7)

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)
