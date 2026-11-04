// Week-by-week roll-ups: volume per sport and planned vs done.

import { sessionLoad } from '../log/stats'
import type { Session, Sport } from '../log/types'
import { addDays, weekStart } from '../plan/dates'
import type { Intensity, PlannedSession } from '../plan/types'
import { counted } from './load'

export type VolumeMetric = 'time' | 'distance' | 'load'

/** Week start dates from the week holding `from` to the week holding `to`. */
export function weekStarts(from: string, to: string, weekStartsOn: 0 | 1) {
  const out: string[] = []
  for (let w = weekStart(from, weekStartsOn); w <= to; w = addDays(w, 7)) out.push(w)
  return out
}

const value = (s: Session, metric: VolumeMetric) =>
  metric === 'time' ? (s.durationSec ?? 0) : metric === 'distance' ? (s.distanceM ?? 0) : (sessionLoad(s) ?? 0)

/** Per sport, the total of `metric` in each week (seconds, metres or load units). */
export function weeklyBySport(sessions: Session[], weeks: string[], weekStartsOn: 0 | 1, metric: VolumeMetric) {
  const index = new Map(weeks.map((w, i) => [w, i]))
  const out = new Map<Sport, number[]>()
  for (const s of sessions) {
    if (!counted(s)) continue
    const i = index.get(weekStart(s.date, weekStartsOn))
    if (i == null) continue
    const row = out.get(s.sport) ?? weeks.map(() => 0)
    row[i] += value(s, metric)
    out.set(s.sport, row)
  }
  return out
}

export type PlanOutcome = 'done' | 'skipped' | 'missed' | 'upcoming'

export function outcome(p: PlannedSession, loggedIds: Set<string>, today: string): PlanOutcome {
  if (loggedIds.has(p.id)) return 'done'
  if (p.skipped) return 'skipped'
  return p.date < today ? 'missed' : 'upcoming'
}

export interface AdherenceWeek {
  start: string
  planned: number
  done: number
  skipped: number
  missed: number
  /** Logged sessions in the week that weren't from the plan. */
  extra: number
  plannedSec: number
  doneSec: number
}

/**
 * Planned vs done per week, counting only planned sessions that are due (today or earlier
 * once logged, earlier otherwise). Time done is the logged duration of planned sessions.
 */
export function adherence(planned: PlannedSession[], sessions: Session[], weeks: string[], weekStartsOn: 0 | 1, today: string) {
  const logged = new Map(sessions.filter((s) => s.planId && counted(s)).map((s) => [s.planId!, s]))
  const loggedIds = new Set(logged.keys())
  const index = new Map(weeks.map((w, i) => [w, i]))
  const rows: AdherenceWeek[] = weeks.map((start) => ({ start, planned: 0, done: 0, skipped: 0, missed: 0, extra: 0, plannedSec: 0, doneSec: 0 }))
  const byIntensity: Record<Intensity, { due: number; done: number }> = { easy: { due: 0, done: 0 }, moderate: { due: 0, done: 0 }, key: { due: 0, done: 0 }, race: { due: 0, done: 0 } }
  const missedList: PlannedSession[] = []

  for (const p of planned) {
    const i = index.get(weekStart(p.date, weekStartsOn))
    if (i == null) continue
    const o = outcome(p, loggedIds, today)
    if (o === 'upcoming') continue
    const row = rows[i]
    row.planned++
    row.plannedSec += p.durationSec ?? 0
    byIntensity[p.intensity].due++
    if (o === 'done') {
      row.done++
      row.doneSec += logged.get(p.id)!.durationSec ?? 0
      byIntensity[p.intensity].done++
    } else if (o === 'skipped') row.skipped++
    else {
      row.missed++
      missedList.push(p)
    }
  }
  for (const s of sessions) {
    if (!counted(s) || s.planId || s.sport === 'recovery') continue
    const i = index.get(weekStart(s.date, weekStartsOn))
    if (i != null) rows[i].extra++
  }
  return { rows, byIntensity, missed: missedList.sort((a, b) => b.date.localeCompare(a.date)) }
}
