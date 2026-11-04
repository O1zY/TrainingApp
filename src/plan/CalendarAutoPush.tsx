import { useEffect, useRef } from 'react'
import { useLog } from '../log/LogStore'
import { useSettings } from '../settings/SettingsContext'
import { usePlan } from './PlanStore'

/**
 * Keeps the Google calendar in step while auto-update is on: after the plan or the log
 * changes (re-plans, moves, skips, sessions logged) it pushes again, a few seconds later so
 * a burst of edits goes as one. Only while Google access is already live in this tab, so
 * it never pops up a sign-in by itself. The push code itself loads only when needed.
 */
export function CalendarAutoPush() {
  const { planned, prefs, updatePrefs } = usePlan()
  const { sessions, workouts } = useLog()
  const { settings } = useSettings()
  const latest = useRef({ planned, prefs, updatePrefs, sessions, workouts, units: settings.units })
  const running = useRef(false)
  const first = useRef(true)

  useEffect(() => {
    latest.current = { planned, prefs, updatePrefs, sessions, workouts, units: settings.units }
  })

  useEffect(() => {
    // Not on first load: only when something changes while the app is open.
    if (first.current) {
      first.current = false
      return
    }
    if (!prefs.autoPush || !prefs.pushCalendarId) return
    const t = setTimeout(async () => {
      if (running.current) return
      running.current = true
      try {
        const m = await import('./pushPlan')
        if (m.googleCanWrite()) await m.pushPlan(latest.current)
      } catch {
        // Shown next time the calendar is updated by hand.
      } finally {
        running.current = false
      }
    }, 4000)
    return () => clearTimeout(t)
  }, [planned, sessions, prefs.autoPush, prefs.pushCalendarId])

  return null
}
