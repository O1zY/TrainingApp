import { sessionFromWorkout } from '../library/workouts'
import { todayIso } from '../log/format'
import type { SessionDraft } from '../log/LogStore'
import { useLog } from '../log/LogStore'
import type { OneRepMax, Session, Workout } from '../log/types'
import { addDays } from './dates'
import { planBlock } from './generate'
import { usePlan } from './PlanStore'
import type { Block, Commitment, PlanEvent, PlannedSession } from './types'

/** The workout behind a planned session: its library workout, or its one-off in the same shape. */
export function plannedWorkout(p: PlannedSession, workouts: Workout[]): Workout | undefined {
  if (p.workoutId) return workouts.find((w) => w.id === p.workoutId)
  if (p.oneOff) return { ...p.oneOff, id: p.id, createdAt: '', updatedAt: '' }
  return undefined
}

/** A log pre-filled from the plan: the workout's structure and targets, on the planned day and time. */
export function sessionFromPlanned(p: PlannedSession, workouts: Workout[], maxes: OneRepMax[]): SessionDraft {
  const w = plannedWorkout(p, workouts) ?? { id: '', name: p.title, sport: p.sport, tags: [], createdAt: '', updatedAt: '' }
  return { ...sessionFromWorkout(w, maxes, p.date), workoutId: p.workoutId, planId: p.id, startTime: p.time, title: p.title }
}

export const loggedFor = (p: PlannedSession, sessions: Session[]) => sessions.find((s) => s.planId === p.id)

export const blockEnd = (b: Pick<Block, 'start' | 'weeks'>) => addDays(b.start, b.weeks * 7 - 1)

/**
 * Re-plans blocks from today (or their start, if later). Logged, locked and past sessions
 * stay; everything else is planned afresh around the latest shifts and events. Pass the
 * new lists when calling straight after a save, as the store won't have updated yet.
 */
export function useReplan() {
  const plan = usePlan()
  const { workouts, sessions } = useLog()
  return (fresh: { blocks?: Block[]; events?: PlanEvent[]; commitments?: Commitment[] } = {}) => {
    const today = todayIso()
    const logged = new Set(sessions.map((s) => s.planId).filter(Boolean))
    const keep = (p: PlannedSession) => p.date < today || !!p.locked || logged.has(p.id)
    const notes: string[] = []
    let count = 0
    for (const block of fresh.blocks ?? plan.blocks) {
      if (blockEnd(block) < today) continue
      const from = block.start > today ? block.start : today
      const fixed = plan.planned.filter((p) => p.blockId === block.id && keep(p))
      const result = planBlock({
        block,
        events: fresh.events ?? plan.events,
        commitments: fresh.commitments ?? plan.commitments,
        prefs: plan.prefs,
        workouts,
        fixed,
        from,
      })
      plan.replacePlanned(block.id, today, keep, result.planned)
      notes.push(...result.notes)
      count += result.planned.length
    }
    return { count, notes }
  }
}
