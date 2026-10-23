import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { newId } from './format'
import type { Multisport, OneRepMax, Session, Wellbeing, Workout } from './types'

interface LogData {
  sessions: Session[]
  multisport: Multisport[]
  wellbeing: Wellbeing[]
  maxes: OneRepMax[]
  workouts: Workout[]
}

const EMPTY: LogData = { sessions: [], multisport: [], wellbeing: [], maxes: [], workouts: [] }
const STORAGE_KEY = 'tt-log-v1'

// Training data lives in localStorage until the Supabase section. Everything that
// touches storage is in this file, so swapping the backend only changes here.
function load(): LogData {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') }
  } catch {
    return EMPTY
  }
}

export type SessionDraft = Omit<Session, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string }
export type WorkoutDraft = Omit<Workout, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string }

interface LogValue extends LogData {
  saveSession: (draft: SessionDraft) => Session
  deleteSession: (id: string) => void
  /** Saves the event and its legs together; legs dropped from the event are unlinked, not deleted. */
  saveMultisport: (event: Omit<Multisport, 'id' | 'legIds' | 'createdAt' | 'updatedAt'> & { id?: string }, legs: SessionDraft[]) => Multisport
  deleteMultisport: (id: string) => void
  saveWellbeing: (entry: Omit<Wellbeing, 'updatedAt'>) => void
  deleteWellbeing: (date: string) => void
  saveMax: (max: OneRepMax, previousName?: string) => void
  deleteMax: (exercise: string) => void
  saveWorkout: (draft: WorkoutDraft) => Workout
  /** Sessions logged from it keep their data; only the link is dropped. */
  deleteWorkout: (id: string) => void
}

const LogContext = createContext<LogValue | null>(null)

const stamp = () => new Date().toISOString()

function toSession(draft: SessionDraft, now: string): Session {
  return { ...draft, id: draft.id ?? newId(), createdAt: draft.createdAt ?? now, updatedAt: now }
}

function upsert<T>(list: T[], item: T, same: (a: T) => boolean) {
  return list.some(same) ? list.map((x) => (same(x) ? item : x)) : [...list, item]
}

export function LogProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LogData>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // Storage unavailable or full; data still works for this visit.
    }
  }, [data])

  const value: LogValue = {
    ...data,

    saveSession(draft) {
      const session = toSession(draft, stamp())
      setData((d) => ({ ...d, sessions: upsert(d.sessions, session, (s) => s.id === session.id) }))
      return session
    },

    deleteSession(id) {
      setData((d) => ({
        ...d,
        sessions: d.sessions.filter((s) => s.id !== id),
        multisport: d.multisport.map((m) => (m.legIds.includes(id) ? { ...m, legIds: m.legIds.filter((l) => l !== id) } : m)),
      }))
    },

    saveMultisport(eventDraft, legDrafts) {
      const now = stamp()
      const id = eventDraft.id ?? newId()
      const legs = legDrafts.map((l) => toSession({ ...l, multisportId: id, date: eventDraft.date }, now))
      const existing = data.multisport.find((m) => m.id === id)
      const event: Multisport = { ...eventDraft, id, legIds: legs.map((l) => l.id), createdAt: existing?.createdAt ?? now, updatedAt: now }
      const keep = new Set(event.legIds)
      setData((d) => {
        let sessions = d.sessions.map((s) => (s.multisportId === id && !keep.has(s.id) ? { ...s, multisportId: undefined, updatedAt: now } : s))
        for (const leg of legs) sessions = upsert(sessions, leg, (s) => s.id === leg.id)
        return { ...d, sessions, multisport: upsert(d.multisport, event, (m) => m.id === id) }
      })
      return event
    },

    deleteMultisport(id) {
      setData((d) => ({
        ...d,
        multisport: d.multisport.filter((m) => m.id !== id),
        sessions: d.sessions.filter((s) => s.multisportId !== id),
      }))
    },

    saveWellbeing(entry) {
      const item = { ...entry, updatedAt: stamp() }
      setData((d) => ({ ...d, wellbeing: upsert(d.wellbeing, item, (w) => w.date === item.date) }))
    },

    deleteWellbeing(date) {
      setData((d) => ({ ...d, wellbeing: d.wellbeing.filter((w) => w.date !== date) }))
    },

    saveMax(max, previousName) {
      setData((d) => {
        const key = (previousName ?? max.exercise).toLowerCase()
        const rest = d.maxes.filter((m) => m.exercise.toLowerCase() !== key && m.exercise.toLowerCase() !== max.exercise.toLowerCase())
        return { ...d, maxes: [...rest, max].sort((a, b) => a.exercise.localeCompare(b.exercise)) }
      })
    },

    deleteMax(exercise) {
      setData((d) => ({ ...d, maxes: d.maxes.filter((m) => m.exercise !== exercise) }))
    },

    saveWorkout(draft) {
      const now = stamp()
      const workout: Workout = { ...draft, id: draft.id ?? newId(), createdAt: draft.createdAt ?? now, updatedAt: now }
      setData((d) => ({ ...d, workouts: upsert(d.workouts, workout, (w) => w.id === workout.id) }))
      return workout
    },

    deleteWorkout(id) {
      setData((d) => ({
        ...d,
        workouts: d.workouts.filter((w) => w.id !== id),
        sessions: d.sessions.map((s) => (s.workoutId === id ? { ...s, workoutId: undefined } : s)),
      }))
    },
  }

  return <LogContext.Provider value={value}>{children}</LogContext.Provider>
}

export function useLog() {
  const ctx = useContext(LogContext)
  if (!ctx) throw new Error('useLog must be used inside LogProvider')
  return ctx
}
