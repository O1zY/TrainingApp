import { newId } from '../log/format'
import type { Commitment, PlanPrefs } from './types'

export const DEFAULT_PREFS: PlanPrefs = {
  commuteMin: 20,
  gapMin: 30,
  dayStart: '06:00',
  dayEnd: '21:30',
  defaultDemand: 'physical',
  workKeywords: ['shift', 'work'],
  calendarIds: ['primary'],
}

export const byDate = <T extends { date: string; start?: string; time?: string }>(a: T, b: T) =>
  a.date.localeCompare(b.date) || (a.start ?? a.time ?? '').localeCompare(b.start ?? b.time ?? '')

/** A re-sync: imported commitments in the range are swapped for the new list, keeping work/demand set by hand. */
export function mergeImported(all: Commitment[], source: Commitment['source'], from: string, to: string, list: Omit<Commitment, 'id'>[]): Commitment[] {
  const replaced = (c: Commitment) => c.source === source && c.date >= from && c.date <= to
  const before = new Map(all.filter(replaced).map((c) => [c.externalId, c]))
  const fresh = list.map((c) => {
    const old = before.get(c.externalId)
    return { ...c, id: old?.id ?? newId(), kind: old?.kind ?? c.kind, demand: old ? old.demand : c.demand }
  })
  return [...all.filter((c) => !replaced(c)), ...fresh].sort(byDate)
}
