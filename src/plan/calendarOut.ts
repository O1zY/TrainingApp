import { addDays, clockMin, minClock } from './dates'
import type { Intensity, PlannedSession } from './types'

// Writing the plan out to Google Calendar. The app makes a calendar of its own
// ("Training plan") and only ever touches events in it, so the rest of the account is
// never changed. Each event carries the planned session's id and a fingerprint of what
// was written, so a push only sends what changed and works the same from any device.
// Only today onwards is written: past events are left as they were.

/** The event body sent to Google (a subset of the Calendar API's Event resource). */
export interface EventBody {
  summary: string
  description: string
  start: { date: string } | { dateTime: string; timeZone: string }
  end: { date: string } | { dateTime: string; timeZone: string }
  colorId?: string
  transparency: 'opaque' | 'transparent'
  extendedProperties: { private: { ttPlanId: string; ttHash: string } }
}

/** An event already in the app's calendar. */
export interface Existing {
  eventId: string
  planId?: string
  hash?: string
  /** Start date (YYYY-MM-DD), to leave past events alone. */
  date: string
}

export interface OutInput {
  planned: PlannedSession
  sportLabel: string
  /** Workout structure, e.g. "8 × 500m, 2′ rest". */
  details?: string
  done: boolean
}

export interface OutOptions {
  timeZone: string
  /** Where the app lives, for a link back to the session; omitted when unknown. */
  appUrl?: string
}

export const CALENDAR_NAME = 'Training plan'
/** Planned sessions without a length are shown as an hour. */
export const DEFAULT_MIN = 60

const INTENSITY_LABEL: Record<Intensity, string> = { easy: 'Easy', moderate: 'Moderate', key: 'Key session', race: 'Race' }
/** Google's event colours: 3 is Grape (the app's violet), 11 Tomato. Easy and moderate use the calendar's own. */
const INTENSITY_COLOR: Partial<Record<Intensity, string>> = { key: '3', race: '11' }

/** Short, stable fingerprint (FNV-1a) of what an event says. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

const mins = (sec: number | undefined) => Math.max(5, Math.round((sec ?? DEFAULT_MIN * 60) / 60))

/** "YYYY-MM-DD" + minutes since midnight → local "YYYY-MM-DDTHH:MM:00", rolling past midnight. */
function wallTime(date: string, min: number) {
  const day = Math.floor(min / 1440)
  return `${addDays(date, day)}T${minClock(min - day * 1440)}:00`
}

export function toEvent({ planned: p, sportLabel, details, done }: OutInput, opts: OutOptions): EventBody {
  const length = mins(p.durationSec)
  const timed = !!p.time
  const startMin = timed ? clockMin(p.time!) : 0
  const lines = [
    `${INTENSITY_LABEL[p.intensity]} · ${sportLabel}${p.durationSec ? ` · ${length}′` : ''}`,
    details,
    p.notes,
    p.reason && `Why this day: ${p.reason}`,
    done && 'Done ✓',
    opts.appUrl && `Open in Training Tracker: ${opts.appUrl}/plan/session/${p.id}`,
  ].filter(Boolean)
  const body: Omit<EventBody, 'extendedProperties'> = {
    summary: `${done ? '✓ ' : ''}${p.title}`,
    description: lines.join('\n'),
    start: timed ? { dateTime: wallTime(p.date, startMin), timeZone: opts.timeZone } : { date: p.date },
    end: timed ? { dateTime: wallTime(p.date, startMin + length), timeZone: opts.timeZone } : { date: addDays(p.date, 1) },
    ...(INTENSITY_COLOR[p.intensity] ? { colorId: INTENSITY_COLOR[p.intensity] } : {}),
    // A session without a set time shouldn't make the whole day look busy to others.
    transparency: timed ? 'opaque' : 'transparent',
  }
  return { ...body, extendedProperties: { private: { ttPlanId: p.id, ttHash: fingerprint(JSON.stringify(body)) } } }
}

/** Planned sessions that belong in the calendar: today onwards and not skipped. */
export const toWrite = (planned: PlannedSession[], today: string) => planned.filter((p) => p.date >= today && !p.skipped)

export interface Changes {
  insert: EventBody[]
  update: { eventId: string; body: EventBody }[]
  remove: string[]
  unchanged: number
}

/**
 * What to send so the calendar matches `wanted`. Events from today on that no longer
 * match a planned session (skipped, deleted, re-planned away, or duplicates) are removed;
 * earlier ones are kept as a record.
 */
export function diff(wanted: EventBody[], existing: Existing[], today: string): Changes {
  const byPlan = new Map<string, Existing>()
  const remove: string[] = []
  for (const e of existing) {
    if (e.planId && !byPlan.has(e.planId)) byPlan.set(e.planId, e)
    else if (e.date >= today) remove.push(e.eventId)
  }
  const out: Changes = { insert: [], update: [], remove, unchanged: 0 }
  const seen = new Set<string>()
  for (const body of wanted) {
    const id = body.extendedProperties.private.ttPlanId
    seen.add(id)
    const e = byPlan.get(id)
    if (!e) out.insert.push(body)
    else if (e.hash !== body.extendedProperties.private.ttHash) out.update.push({ eventId: e.eventId, body })
    else out.unchanged++
  }
  for (const [id, e] of byPlan) if (!seen.has(id) && e.date >= today) out.remove.push(e.eventId)
  return out
}
