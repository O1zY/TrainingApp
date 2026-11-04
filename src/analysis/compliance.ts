import type { Session } from '../log/types'
import { loggedFor } from '../plan/planned'
import type { Intensity, PlannedSession } from '../plan/types'
import { inWeek } from './series'

// Planned against done. Only sessions planned up to today count towards completion;
// later ones are still to come.

export type PlanStatus = 'done' | 'skipped' | 'missed' | 'upcoming'

export function planStatus(p: PlannedSession, sessions: Session[], today: string): PlanStatus {
  if (loggedFor(p, sessions)) return 'done'
  if (p.skipped) return 'skipped'
  return p.date < today ? 'missed' : 'upcoming'
}

export interface ComplianceWeek {
  start: string
  planned: number
  done: number
  skipped: number
  missed: number
  plannedSec: number
  /** Actual time of the sessions logged against the plan. */
  doneSec: number
}

export function complianceByWeek(planned: PlannedSession[], sessions: Session[], weeks: string[], today: string): ComplianceWeek[] {
  return weeks.map((start) => {
    const wk = planned.filter((p) => inWeek(p.date, start) && p.date <= today)
    const status = wk.map((p) => planStatus(p, sessions, today))
    return {
      start,
      planned: wk.length,
      done: status.filter((s) => s === 'done').length,
      skipped: status.filter((s) => s === 'skipped').length,
      missed: status.filter((s) => s === 'missed').length,
      plannedSec: wk.reduce((a, p) => a + (p.durationSec ?? 0), 0),
      doneSec: wk.reduce((a, p) => a + (loggedFor(p, sessions)?.durationSec ?? 0), 0),
    }
  })
}

export const INTENSITIES: Intensity[] = ['key', 'moderate', 'easy', 'race']

export function complianceByIntensity(planned: PlannedSession[], sessions: Session[], from: string, today: string) {
  const due = planned.filter((p) => p.date >= from && p.date <= today)
  return INTENSITIES.map((intensity) => {
    const of = due.filter((p) => p.intensity === intensity)
    return { intensity, planned: of.length, done: of.filter((p) => loggedFor(p, sessions)).length }
  }).filter((r) => r.planned)
}

/** Logged sessions in the range that weren't from the plan. */
export const unplanned = (sessions: Session[], from: string, to: string) =>
  sessions.filter((s) => s.date >= from && s.date <= to && !s.planId && s.sport !== 'transition' && s.status === 'completed')
