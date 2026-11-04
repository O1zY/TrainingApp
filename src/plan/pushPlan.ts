import { structureSummary } from '../library/workouts'
import { todayIso } from '../log/format'
import { useLog } from '../log/LogStore'
import type { Session, Workout } from '../log/types'
import { SPORTS } from '../log/sports'
import { useSettings, type Units } from '../settings/SettingsContext'
import { GoogleError, applyChanges, createPlanCalendar, planCalendarEvents } from './calendar'
import { CALENDAR_NAME, diff, toEvent, toWrite, type Changes, type Existing } from './calendarOut'
import { plannedWorkout } from './planned'
import { usePlan } from './PlanStore'
import type { PlanPrefs, PlannedSession } from './types'

export { googleCanWrite } from './calendar'

export interface PushResult extends Changes {
  calendarId: string
}

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export interface PushData {
  planned: PlannedSession[]
  prefs: PlanPrefs
  updatePrefs: (patch: Partial<PlanPrefs>) => void
  sessions: Session[]
  workouts: Workout[]
  units: Units
}

/**
 * Writes planned sessions from today on into the app's Google calendar, making it the
 * first time (or again, if it was deleted in Google). Returns what changed.
 */
export async function pushPlan(d: PushData, onProgress?: (done: number, total: number) => void): Promise<PushResult> {
  const today = todayIso()
  const done = new Set(d.sessions.map((s) => s.planId).filter(Boolean))
  const opts = { timeZone: timeZone(), appUrl: location.origin }
  const wanted = toWrite(d.planned, today).map((p) => {
    const w = plannedWorkout(p, d.workouts)
    const details = w ? structureSummary(w, d.units) || undefined : undefined
    return toEvent({ planned: p, sportLabel: SPORTS[p.sport].label, details, done: done.has(p.id) }, opts)
  })

  let calendarId = d.prefs.pushCalendarId
  let existing: Existing[] | undefined
  try {
    existing = calendarId ? await planCalendarEvents(calendarId, today) : undefined
  } catch (e) {
    // Deleted (or unsubscribed) in Google: start a fresh one.
    if (!(e instanceof GoogleError && (e.status === 404 || e.status === 410))) throw e
  }
  if (!calendarId || !existing) {
    calendarId = await createPlanCalendar(CALENDAR_NAME, opts.timeZone)
    d.updatePrefs({ pushCalendarId: calendarId })
    existing = []
  }
  const changes = diff(wanted, existing, today)
  await applyChanges(calendarId, changes, onProgress)
  d.updatePrefs({ lastPush: new Date().toISOString() })
  return { ...changes, calendarId }
}

export function usePushPlan() {
  const { planned, prefs, updatePrefs } = usePlan()
  const { sessions, workouts } = useLog()
  const { settings } = useSettings()
  return (onProgress?: (done: number, total: number) => void) => pushPlan({ planned, prefs, updatePrefs, sessions, workouts, units: settings.units }, onProgress)
}

/** One-line summary of a push for the UI. */
export function describePush(r: Changes): string {
  const parts = [r.insert.length && `${r.insert.length} added`, r.update.length && `${r.update.length} updated`, r.remove.length && `${r.remove.length} removed`].filter(Boolean)
  return parts.length ? `Calendar updated: ${parts.join(', ')}.` : 'Calendar already up to date.'
}
