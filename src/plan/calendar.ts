import { todayIso } from '../log/format'
import { addDays, minClock } from './dates'
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

// Read-only access in the browser through Google Identity Services. Needs an OAuth
// client ID (Web application, with this site's origin allowed) in VITE_GOOGLE_CLIENT_ID.
// The access token is kept in memory only; each sync asks Google again if it's expired.

interface TokenResponse {
  access_token?: string
  expires_in?: number
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
            callback: (r: TokenResponse) => void
            error_callback?: (e: { type: string; message?: string }) => void
          }) => { requestAccessToken: (o?: { prompt?: string }) => void }
        }
      }
    }
  }
}

const CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const API = 'https://www.googleapis.com/calendar/v3'

export const googleConfigured = !!CLIENT_ID

let token: { value: string; expires: number } | undefined
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

async function accessToken(): Promise<string> {
  if (token && token.expires > Date.now() + 60000) return token.value
  if (!CLIENT_ID) throw new Error('Google Calendar is not set up: add VITE_GOOGLE_CLIENT_ID')
  await loadGis()
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (!r.access_token) return reject(new Error(r.error ?? 'Google sign-in was cancelled'))
        token = { value: r.access_token, expires: Date.now() + (r.expires_in ?? 3600) * 1000 }
        resolve(r.access_token)
      },
      error_callback: (e) => reject(new Error(e.message ?? 'Google sign-in was cancelled')),
    })
    client.requestAccessToken()
  })
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${await accessToken()}` } })
  if (res.status === 401) token = undefined
  if (!res.ok) throw new Error(`Google Calendar said ${res.status}`)
  return res.json()
}

export const googleConnected = () => !!token && token.expires > Date.now()

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
