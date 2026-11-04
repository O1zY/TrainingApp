import { todayIso } from '../log/format'
import { addDays, minClock } from './dates'
import type { Changes, Existing } from './calendarOut'
import type { Commitment, PlanPrefs } from './types'

// Bringing outside commitments in from calendars: an .ics file (any calendar app or
// rota system can export one) or a live read of Google Calendar. Imported events
// whose title matches a work keyword become work shifts; everything else is busy time.

export interface CalEvent {
  uid: string
  title: string
  start: Date
  end: Date
}

export type CommitmentDraft = Omit<Commitment, 'id'>

const hhmm = (d: Date) => minClock(d.getHours() * 60 + d.getMinutes())

export function toCommitments(events: CalEvent[], prefs: PlanPrefs, source: Commitment['source']): CommitmentDraft[] {
  const keywords = prefs.workKeywords.map((k) => k.trim().toLowerCase()).filter(Boolean)
  return events
    .filter((e) => e.end.getTime() - e.start.getTime() < 86400000 && e.end > e.start)
    .map((e) => {
      const work = keywords.some((k) => e.title.toLowerCase().includes(k))
      return {
        date: todayIso(e.start),
        start: hhmm(e.start),
        end: hhmm(e.end),
        kind: work ? 'work' : 'busy',
        demand: work ? prefs.defaultDemand : undefined,
        title: e.title || undefined,
        source,
        externalId: e.uid,
      }
    })
}

// ---- .ics ------------------------------------------------------------------

/** "20261029T070000Z", "20261029T070000" (local or TZID wall time) or "20261029" (all day). */
function icsDate(value: string): { date: Date; allDay: boolean } | undefined {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/)
  if (!m) return undefined
  const [, y, mo, d, h, mi, s, z] = m
  if (!h) return { date: new Date(+y, +mo - 1, +d), allDay: true }
  const date = z ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0))) : new Date(+y, +mo - 1, +d, +h, +mi, +(s ?? 0))
  return { date, allDay: false }
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/** Expands the common repeat rules (daily or weekly, with interval, count, until and weekdays). */
function expand(start: Date, end: Date, rule: string | undefined, exdates: number[], to: Date): [Date, Date][] {
  if (!rule) return [[start, end]]
  const r = Object.fromEntries(rule.split(';').map((p) => p.split('=') as [string, string]))
  if (r.FREQ !== 'DAILY' && r.FREQ !== 'WEEKLY') return [[start, end]]
  const interval = Number(r.INTERVAL ?? 1)
  const count = r.COUNT ? Number(r.COUNT) : Infinity
  const until = r.UNTIL ? icsDate(r.UNTIL)?.date : undefined
  const byDay = r.BYDAY ? r.BYDAY.split(',').map((d: string) => DAY_CODES.indexOf(d.slice(-2))) : [start.getDay()]
  const length = end.getTime() - start.getTime()
  const out: [Date, Date][] = []
  let made = 0
  for (let i = 0; i < 3660 && made < count; i++) {
    const day = new Date(start)
    day.setDate(start.getDate() + i)
    if (day > to || (until && day > until)) break
    const weeksIn = Math.floor(i / 7)
    const matches = r.FREQ === 'DAILY' ? i % interval === 0 : weeksIn % interval === 0 && byDay.includes(day.getDay())
    if (!matches) continue
    made++
    if (!exdates.includes(day.getTime())) out.push([day, new Date(day.getTime() + length)])
  }
  return out
}

export function parseIcs(text: string, from: string, to: string): CalEvent[] {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
  const windowFrom = new Date(`${from}T00:00:00`)
  const windowTo = new Date(`${addDays(to, 1)}T00:00:00`)
  const out: CalEvent[] = []
  let cur: Record<string, string> | undefined
  let exdates: number[] = []

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = {}
      exdates = []
      continue
    }
    if (line === 'END:VEVENT' && cur) {
      const start = cur.DTSTART ? icsDate(cur.DTSTART) : undefined
      const end = cur.DTEND ? icsDate(cur.DTEND) : undefined
      if (start && end && !start.allDay && cur.STATUS !== 'CANCELLED') {
        expand(start.date, end.date, cur.RRULE, exdates, windowTo).forEach(([s, e], i) => {
          if (e > windowFrom && s < windowTo) out.push({ uid: `${cur!.UID ?? 'ics'}#${i}`, title: unescape(cur!.SUMMARY ?? ''), start: s, end: e })
        })
      }
      cur = undefined
      continue
    }
    if (!cur) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const name = line.slice(0, colon).split(';')[0].toUpperCase()
    const value = line.slice(colon + 1)
    if (name === 'EXDATE') value.split(',').forEach((v) => { const d = icsDate(v); if (d) exdates.push(d.date.getTime()) })
    else cur[name] = value
  }
  return out
}

const unescape = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1')

// ---- Google Calendar ---------------------------------------------------------

// Access in the browser through Google Identity Services. Needs an OAuth client ID (Web
// application, with this site's origin allowed) in VITE_GOOGLE_CLIENT_ID. Reading asks
// only for read access; writing the plan out asks, the first time, for access to
// calendars the app makes itself (it can't see or change any others through that).
// The access token is kept in memory only; Google is asked again when it expires.

interface TokenResponse {
  access_token?: string
  expires_in?: number
  scope?: string
  error?: string
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            include_granted_scopes?: boolean
            callback: (r: TokenResponse) => void
            error_callback?: (e: { type: string; message?: string }) => void
          }) => { requestAccessToken: (o?: { prompt?: string }) => void }
        }
      }
    }
  }
}

const CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID
export const READ_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
export const WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created'
const API = 'https://www.googleapis.com/calendar/v3'

export const googleConfigured = !!CLIENT_ID

let token: { value: string; expires: number; scopes: Set<string> } | undefined
let gis: Promise<void> | undefined

function loadGis() {
  gis ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      gis = undefined
      reject(new Error('Could not load Google sign-in'))
    }
    document.head.appendChild(script)
  })
  return gis
}

const live = (scope: string) => !!token && token.expires > Date.now() + 60000 && token.scopes.has(scope)

async function accessToken(scope = READ_SCOPE): Promise<string> {
  if (live(scope)) return token!.value
  if (!CLIENT_ID) throw new Error('Google Calendar is not set up: add VITE_GOOGLE_CLIENT_ID')
  await loadGis()
  // Keep what's already granted, so reading and writing share one token.
  const wanted = new Set([scope, ...(token && token.expires > Date.now() ? token.scopes : [])])
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: [...wanted].join(' '),
      include_granted_scopes: true,
      callback: (r) => {
        if (!r.access_token) return reject(new Error(r.error ?? 'Google sign-in was cancelled'))
        const scopes = new Set((r.scope ?? [...wanted].join(' ')).split(' '))
        if (!scopes.has(scope)) return reject(new Error(scope === WRITE_SCOPE ? 'Google didn’t give permission to add a calendar. Tick the box for it and try again.' : 'Google didn’t give permission to read your calendar.'))
        token = { value: r.access_token, expires: Date.now() + (r.expires_in ?? 3600) * 1000, scopes }
        resolve(r.access_token)
      },
      error_callback: (e) => reject(new Error(e.message ?? 'Google sign-in was cancelled')),
    })
    client.requestAccessToken()
  })
}

export class GoogleError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** One API call. Rate limits (429, or 403 rateLimitExceeded) are retried with backoff. */
async function call<T>(path: string, init: RequestInit = {}, scope = READ_SCOPE): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await accessToken(scope)}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    })
    if (res.status === 401) token = undefined
    if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T
    const text = await res.text().catch(() => '')
    const limited = res.status === 429 || (res.status === 403 && /rateLimitExceeded|userRateLimitExceeded/.test(text))
    if (limited && attempt < 4) {
      await wait(1000 * 2 ** attempt)
      continue
    }
    throw new GoogleError(`Google Calendar said ${res.status}${limited ? ' (too many changes at once, try again in a minute)' : ''}`, res.status)
  }
}

const get = <T,>(path: string) => call<T>(path)

export const googleConnected = () => !!token && token.expires > Date.now()
/** True while a token that can write the plan is live, so a push won't need a sign-in popup. */
export const googleCanWrite = () => live(WRITE_SCOPE)

export async function listCalendars() {
  const data = await get<{ items: { id: string; summary: string; primary?: boolean }[] }>('/users/me/calendarList?minAccessRole=reader')
  return data.items.map((c) => ({ id: c.primary ? 'primary' : c.id, name: c.summary, primary: !!c.primary }))
}

interface GEvent {
  id: string
  summary?: string
  status?: string
  transparency?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  extendedProperties?: { private?: Record<string, string> }
}

export async function googleEvents(calendarIds: string[], from: string, to: string): Promise<CalEvent[]> {
  const timeMin = new Date(`${from}T00:00:00`).toISOString()
  const timeMax = new Date(`${addDays(to, 1)}T00:00:00`).toISOString()
  const out: CalEvent[] = []
  for (const id of calendarIds) {
    let page: string | undefined
    do {
      const q = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '2500', ...(page ? { pageToken: page } : {}) })
      const data = await get<{ items: GEvent[]; nextPageToken?: string }>(`/calendars/${encodeURIComponent(id)}/events?${q}`)
      for (const e of data.items) {
        // All-day events and ones marked "free" don't take time out of the day.
        if (e.status === 'cancelled' || e.transparency === 'transparent' || !e.start.dateTime || !e.end.dateTime) continue
        out.push({ uid: `${id}:${e.id}`, title: e.summary ?? '', start: new Date(e.start.dateTime), end: new Date(e.end.dateTime) })
      }
      page = data.nextPageToken
    } while (page)
  }
  return out
}

// ---- Writing the plan out ------------------------------------------------------

/** Makes the app's own calendar; returns its id. */
export async function createPlanCalendar(name: string, timeZone: string): Promise<string> {
  const cal = await call<{ id: string }>('/calendars', { method: 'POST', body: JSON.stringify({ summary: name, timeZone, description: 'Planned sessions from Training Tracker. Changes made here are overwritten on the next update.' }) }, WRITE_SCOPE)
  return cal.id
}

/** Every event in the app's calendar from `from` on (all of them when `from` is omitted). */
export async function planCalendarEvents(calendarId: string, from?: string): Promise<Existing[]> {
  const out: Existing[] = []
  let page: string | undefined
  do {
    const q = new URLSearchParams({ singleEvents: 'true', maxResults: '2500', ...(from ? { timeMin: new Date(`${from}T00:00:00`).toISOString() } : {}), ...(page ? { pageToken: page } : {}) })
    const data = await call<{ items: GEvent[]; nextPageToken?: string }>(`/calendars/${encodeURIComponent(calendarId)}/events?${q}`, {}, WRITE_SCOPE)
    for (const e of data.items) {
      if (e.status === 'cancelled') continue
      const p = e.extendedProperties?.private
      out.push({ eventId: e.id, planId: p?.ttPlanId, hash: p?.ttHash, date: (e.start.date ?? e.start.dateTime ?? '').slice(0, 10) })
    }
    page = data.nextPageToken
  } while (page)
  return out
}

/** Sends the changes a few at a time; reports progress as it goes. */
export async function applyChanges(calendarId: string, changes: Changes, onProgress?: (done: number, total: number) => void): Promise<void> {
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`
  const jobs: (() => Promise<unknown>)[] = [
    ...changes.remove.map((id) => () =>
      call(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' }, WRITE_SCOPE).catch((e) => {
        // Already gone is fine.
        if (!(e instanceof GoogleError && (e.status === 404 || e.status === 410))) throw e
      }),
    ),
    ...changes.update.map(({ eventId, body }) => () => call(`${base}/${encodeURIComponent(eventId)}`, { method: 'PUT', body: JSON.stringify(body) }, WRITE_SCOPE)),
    ...changes.insert.map((body) => () => call(base, { method: 'POST', body: JSON.stringify(body) }, WRITE_SCOPE)),
  ]
  let done = 0
  onProgress?.(0, jobs.length)
  for (let i = 0; i < jobs.length; i += 4) {
    await Promise.all(jobs.slice(i, i + 4).map((j) => j()))
    done = Math.min(jobs.length, i + 4)
    onProgress?.(done, jobs.length)
  }
}
