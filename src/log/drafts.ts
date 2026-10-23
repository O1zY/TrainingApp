import { newId, nowClock, todayIso } from './format'
import type { SessionDraft } from './LogStore'
import type { Session, Sport } from './types'

export function blankSession(sport: Sport, date = todayIso()): SessionDraft {
  return { sport, date, startTime: date === todayIso() ? nowClock() : undefined, status: 'completed', source: 'manual' }
}

/** Copies a past session as a starting point: same work, new date, fresh ids. */
export function copyOf(s: Session): SessionDraft {
  return {
    ...s,
    id: undefined,
    createdAt: undefined,
    date: todayIso(),
    startTime: nowClock(),
    multisportId: undefined,
    externalId: undefined,
    source: 'manual',
    status: 'completed',
    pieces: s.pieces?.map((p) => ({ ...p, id: newId() })),
    exercises: s.exercises?.map((e) => ({ ...e, id: newId(), sets: e.sets.map((x) => ({ ...x, id: newId() })) })),
  }
}
