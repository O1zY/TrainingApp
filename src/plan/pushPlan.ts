import { useEffect, useRef } from 'react'
import { structureSummary } from '../library/workouts'
import { todayIso } from '../log/format'
import { useLog } from '../log/LogStore'
import { SPORTS } from '../log/sports'
import { useSettings } from '../settings/SettingsContext'
import { GoogleError, applyChanges, createPlanCalendar, googleCanWrite, planCalendarEvents } from './calendar'
import { CALENDAR_NAME, diff, toEvent, toWrite, type Changes, type Existing } from './calendarOut'
import { plannedWorkout } from './planned'
import { usePlan } from './PlanStore'

export interface PushResult extends Changes {
  calendarId: string
}

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

/**
 * Writes planned sessions from today on into the app's Google calendar, making it the
 * first time (or again, if it was deleted in Google). Returns what changed.
 */
export function usePushPlan() {
  const { planned, prefs, updatePrefs } = usePlan()
  const { sessions, workouts } = useLog()
  const { settings } = useSettings()

  return async (onProgress?: (done: number, total: number) => void): Promise<PushResult> => {
    const today = todayIso()
    const done = new Set(sessions.map((s) => s.planId).filter(Boolean))
    const opts = { timeZone: timeZone(), appUrl: location.origin }
    const wanted = toWrite(planned, today).map((p) => {
      const w = plannedWorkout(p, workouts)
      const details = w ? structureSummary(w, settings.units) || undefined : undefined
      return toEvent({ planned: p, sportLabel: SPORTS[p.sport].label, details, done: done.has(p.id) }, opts)
    })

    let calendarId = prefs.pushCalendarId
    let existing: Existing[] | undefined
    try {
      existing = calendarId ? await planCalendarEvents(calendarId, today) : undefined
    } catch (e) {
      // Deleted (or unsubscribed) in Google: start a fresh one.
      if (!(e instanceof GoogleError && (e.status === 404 || e.status === 410))) throw e
    }
    if (!calendarId || !existing) {
      calendarId = await createPlanCalendar(CALENDAR_NAME, opts.timeZone)
      updatePrefs({ pushCalendarId: calendarId })
      existing = []
    }
    const changes = diff(wanted, existing, today)
    await applyChanges(calendarId, changes, onProgress)
    updatePrefs({ lastPush: new Date().toISOString() })
    return { ...changes, calendarId }
  }
}

/** One-line summary of a push for the UI. */
export function describePush(r: Changes): string {
  const parts = [r.insert.length && `${r.insert.length} added`, r.update.length && `${r.update.length} updated`, r.remove.length && `${r.remove.length} removed`].filter(Boolean)
  return parts.length ? `Calendar updated: ${parts.join(', ')}.` : 'Calendar already up to date.'
}

/**
 * Keeps the calendar in step while auto-update is on: after the plan or the log changes
 * (re-plans, moves, skips, sessions logged) it pushes again, a few seconds later so a burst
 * of edits goes as one. Only while Google access is already live in this tab, so it never
 * pops up a sign-in by itself.
 */
export function CalendarAutoPush() {
  const { planned, prefs } = usePlan()
  const { sessions } = useLog()
  const push = usePushPlan()
  const pushRef = useRef(push)
  const running = useRef(false)
  const first = useRef(true)

  useEffect(() => {
    pushRef.current = push
  })

  useEffect(() => {
    // Not on first load: only when something changes while the app is open.
    if (first.current) {
      first.current = false
      return
    }
    if (!prefs.autoPush || !prefs.pushCalendarId) return
    const t = setTimeout(() => {
      if (running.current || !googleCanWrite()) return
      running.current = true
      pushRef.current()
        .catch(() => undefined)
        .finally(() => (running.current = false))
    }, 4000)
    return () => clearTimeout(t)
  }, [planned, sessions, prefs.autoPush, prefs.pushCalendarId])

  return null
}
