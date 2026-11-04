import { SPORTS, kindLabel } from '../log/sports'
import type { PlanEvent } from './types'

/** The event is on, or spans, this date. */
export const covers = (e: Pick<PlanEvent, 'date' | 'endDate'>, date: string) => date >= e.date && date <= (e.endDate ?? e.date)

/** "A race · Duathlon" */
export const raceLabel = (e: PlanEvent) =>
  [e.priority && `${e.priority} race`, e.multisport ? kindLabel(e.multisport) : e.sport && SPORTS[e.sport].label].filter(Boolean).join(' · ')
