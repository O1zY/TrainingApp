import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { SessionDraft } from '../log/LogStore'
import { useLog } from '../log/LogStore'
import { KEYS, useStoredState, withArrays } from '../storage'
import { todayIso } from '../log/format'
import { addDays } from '../plan/dates'
import { usePlan } from '../plan/PlanStore'
import type { Session } from '../log/types'
import { kindLabel } from '../log/sports'
import {
  NotConnected,
  RateLimited,
  deauthorize,
  getActivity,
  listActivities,
  refreshTokens,
  serverStatus,
  type ServerStatus,
  type StravaActivity,
  type StravaAthlete,
  type StravaTokens,
} from './api'
import { fillFrom, toSession } from './convert'
import { planImport, plannedFor, type ReviewItem } from './match'
import { findMultisport, manualEventFor, raceFor } from './multisport'

// The Strava connection and sync. localStorage (`tt-strava-v1`, via src/storage.ts) holds the tokens, what's
// been imported and anything waiting for review; this file is the only one that touches it.
// Sessions themselves go through the log store like any other.

export interface SyncResult {
  at: string
  created: number
  merged: number
  linked: number
  review: number
  details: number
  /** Duathlons and triathlons put back together from their legs. */
  grouped?: string[]
  message?: string
  error?: boolean
}

interface StravaData {
  tokens?: StravaTokens
  athlete?: StravaAthlete
  /** First day to import from (YYYY-MM-DD). Moving it earlier fetches the older activities on the next sync. */
  importFrom: string
  /** importFrom as of the last full listing. */
  syncedFrom?: string
  lastSync?: string
  /** Every activity id already dealt with: imported, merged, skipped or waiting for review. */
  handled: string[]
  /** Imported from the activity list only; laps, notes and RPE still to fetch. */
  needDetail: string[]
  review: ReviewItem[]
  lastResult?: SyncResult
}

const EMPTY: StravaData = { importFrom: addDays(todayIso(), -84), handled: [], needDetail: [], review: [] }
/** Detail reads per sync. Strava allows 100 reads per 15 minutes; this leaves room for the list and a second sync. */
const DETAIL_BUDGET = 60
/** Re-list the last few days each time: activities are often uploaded hours or days after they start. */
const OVERLAP_DAYS = 3
const AUTO_SYNC_MIN = 30

const parseStrava = (saved: Record<string, unknown>): StravaData => withArrays(EMPTY, saved)

export type ReviewChoice = { merge: string } | 'new' | 'skip'

interface StravaValue extends StravaData {
  server?: ServerStatus
  connected: boolean
  syncing: boolean
  connect: (tokens: StravaTokens, athlete?: StravaAthlete) => void
  disconnect: () => Promise<void>
  sync: () => Promise<SyncResult | undefined>
  resolveReview: (activityId: string, choice: ReviewChoice) => void
  setImportFrom: (date: string) => void
  /** Lets activities that were skipped, or whose session was deleted, come back on the next sync. */
  forgetSkipped: () => void
}

const StravaContext = createContext<StravaValue | null>(null)

const localMidnightEpoch = (iso: string) => Math.floor(new Date(`${iso}T00:00:00`).getTime() / 1000)

/** Swaps a Strava-only session for a fuller version, or fills gaps in one that's been edited or merged. */
function upgraded(existing: Session, fresh: SessionDraft): Session | undefined {
  const untouched = existing.source === 'strava' && existing.createdAt === existing.updatedAt
  if (!untouched) return fillFrom(existing, fresh)
  return { ...fresh, id: existing.id, createdAt: existing.createdAt, updatedAt: existing.updatedAt, planId: existing.planId, workoutId: existing.workoutId, multisportId: existing.multisportId, title: fresh.title ?? existing.title, durationSec: existing.multisportId ? existing.durationSec : fresh.durationSec }
}

export function StravaProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useStoredState(KEYS.strava, parseStrava)
  const [server, setServer] = useState<ServerStatus>()
  const [syncing, setSyncing] = useState(false)
  const log = useLog()
  const { planned, events } = usePlan()

  // The sync is async; refs give it the latest data rather than what it started with.
  const dataRef = useRef(data)
  const logRef = useRef(log)
  const plannedRef = useRef(planned)
  const eventsRef = useRef(events)
  useLayoutEffect(() => {
    dataRef.current = data
    logRef.current = log
    plannedRef.current = planned
    eventsRef.current = events
  })
  const running = useRef(false)

  useEffect(() => {
    serverStatus().then(setServer)
  }, [])

  const patch = useCallback((p: Partial<StravaData>) => setData((d) => ({ ...d, ...p })), [setData])

  const token = useCallback(async () => {
    const t = dataRef.current.tokens
    if (!t) throw new NotConnected('Strava isn’t connected.')
    if (t.expiresAt * 1000 > Date.now() + 60000) return t.accessToken
    const fresh = await refreshTokens(t.refreshToken)
    dataRef.current = { ...dataRef.current, tokens: fresh }
    setData((d) => ({ ...d, tokens: fresh }))
    return fresh.accessToken
  }, [setData])

  const sync = useCallback(async (): Promise<SyncResult | undefined> => {
    if (running.current || !dataRef.current.tokens) return undefined
    running.current = true
    setSyncing(true)
    const d = dataRef.current
    const result: SyncResult = { at: new Date().toISOString(), created: 0, merged: 0, linked: 0, review: 0, details: 0 }
    try {
      const full = !d.lastSync || !d.syncedFrom || d.importFrom < d.syncedFrom
      const after = full ? localMidnightEpoch(d.importFrom) : Math.floor(new Date(d.lastSync!).getTime() / 1000) - OVERLAP_DAYS * 86400
      const listed = await listActivities(token, after)
      const handled = new Set(d.handled)
      const fresh = listed.filter((a) => !handled.has(String(a.id)) && a.start_date_local.slice(0, 10) >= d.importFrom)

      // Details (laps, notes, RPE) for new activities first, newest first, then older leftovers.
      let budget = DETAIL_BUDGET
      let limited = false
      const detailed = new Map<string, StravaActivity>()
      const fetchDetail = async (id: string) => {
        if (budget <= 0 || limited) return
        budget--
        try {
          detailed.set(id, await getActivity(token, id))
          result.details++
        } catch (e) {
          if (e instanceof RateLimited) limited = true
          else if (e instanceof NotConnected) throw e
        }
      }
      for (const a of [...fresh].reverse()) await fetchDetail(String(a.id))
      for (const id of d.needDetail) if (!detailed.has(id)) await fetchDetail(id)

      const drafts = fresh.map((a) => toSession(detailed.get(String(a.id)) ?? a))
      // Multisport legs are timed on the clock, so the gaps between them are the transitions.
      const groups = findMultisport(fresh)
      const legIds = new Set(groups.flatMap((g) => g.legs.map((i) => drafts[i].externalId)))
      groups.forEach((g) => g.legs.forEach((i) => (drafts[i].durationSec = fresh[i].elapsed_time || drafts[i].durationSec)))

      const { sessions, multisport, saveSession, saveMultisport } = logRef.current
      // Legs are matched and linked to the plan as one event below, not one by one.
      const plan = planImport(drafts.filter((x) => !legIds.has(x.externalId)), sessions)

      const logged = new Set(sessions.map((s) => s.planId).filter((x): x is string => !!x))
      for (const draft of plan.create) {
        const p = plannedFor(draft, plannedRef.current, logged)
        if (p) {
          logged.add(p.id)
          result.linked++
        }
        saveSession(p ? { ...draft, planId: p.id, workoutId: p.workoutId, title: draft.title ?? p.title } : draft)
        result.created++
      }
      for (const m of plan.merge) {
        const existing = sessions.find((s) => s.id === m.sessionId)
        const next = existing && fillFrom(existing, m.draft)
        if (next) saveSession(next)
        result.merged++
      }

      // Put duathlons and triathlons back together. If the event was logged by hand, Strava
      // fills in its legs; otherwise the legs are imported and grouped into a new event.
      for (const g of groups) {
        const legDrafts = g.legs.map((i) => drafts[i])
        const date = legDrafts[0].date
        const manual = manualEventFor(date, g, legDrafts.map((x) => x.sport), multisport, sessions)
        if (manual) {
          manual.legs.forEach((leg, k) => {
            const next = fillFrom(leg, legDrafts[k])
            if (next) saveSession(next)
          })
          result.merged += legDrafts.length
          continue
        }
        const legs = legDrafts.map((x) => saveSession(x))
        result.created += legs.length
        const race = raceFor(date, g.kind, eventsRef.current)
        const planRace = race && plannedRef.current.find((p) => p.eventId === race.id && p.date === date && !logged.has(p.id))
        const sessionsForEvent = legs.map((l, k) => (k === 0 && planRace ? { ...l, planId: planRace.id } : l))
        if (planRace) {
          logged.add(planRace.id)
          result.linked++
        }
        saveMultisport({ kind: g.kind, date, title: race?.name, race: !!race || legs.some((l) => l.type === 'race') }, sessionsForEvent)
        result.grouped = [...(result.grouped ?? []), race?.name ?? kindLabel(g.kind)]
      }

      // Older imports that were waiting for their details.
      let review = [...d.review, ...plan.review]
      for (const id of d.needDetail) {
        const detail = detailed.get(id)
        if (!detail) continue
        const draft = toSession(detail)
        for (const s of sessions.filter((x) => x.externalId === id)) {
          const next = upgraded(s, draft)
          if (next) saveSession(next)
        }
        review = review.map((r) => (r.activityId === id ? { ...r, draft } : r))
      }

      const newIds = fresh.map((a) => String(a.id))
      const stillNeed = [...d.needDetail.filter((id) => !detailed.has(id)), ...newIds.filter((id) => !detailed.has(id))]
      result.review = plan.review.length
      if (limited || stillNeed.length) result.message = `${stillNeed.length} ${stillNeed.length === 1 ? 'activity is' : 'activities are'} still waiting for laps and notes; they’ll fill in on later syncs.`
      setData((cur) => ({
        ...cur,
        handled: [...new Set([...cur.handled, ...newIds])],
        needDetail: [...new Set(stillNeed)],
        review: review.filter((r, i, all) => all.findIndex((x) => x.activityId === r.activityId) === i),
        lastSync: result.at,
        syncedFrom: full ? cur.importFrom : cur.syncedFrom,
        lastResult: result,
      }))
    } catch (e) {
      result.error = true
      result.message = (e as Error).message
      if (e instanceof NotConnected) setData((cur) => ({ ...cur, tokens: undefined, lastResult: result }))
      else patch({ lastResult: result })
    } finally {
      running.current = false
      setSyncing(false)
    }
    return result
  }, [token, patch, setData])

  // Catch up quietly when the app opens, at most every half hour.
  const autoRan = useRef(false)
  useEffect(() => {
    if (autoRan.current || !data.tokens) return
    autoRan.current = true
    if (!data.lastSync || Date.now() - new Date(data.lastSync).getTime() > AUTO_SYNC_MIN * 60000) void sync()
  }, [data.tokens, data.lastSync, sync])

  const value: StravaValue = {
    ...data,
    server,
    connected: !!data.tokens,
    syncing,
    sync,

    connect(tokens, athlete) {
      dataRef.current = { ...dataRef.current, tokens, athlete: athlete ?? dataRef.current.athlete }
      autoRan.current = true
      setData((d) => ({ ...d, tokens, athlete: athlete ?? d.athlete }))
    },

    async disconnect() {
      const t = data.tokens
      setData((d) => ({ ...d, tokens: undefined, athlete: undefined, review: [], needDetail: [], lastResult: undefined }))
      if (t) await deauthorize(t.accessToken)
    },

    resolveReview(activityId, choice) {
      const item = data.review.find((r) => r.activityId === activityId)
      if (!item) return
      const { sessions, saveSession } = log
      if (choice === 'new') saveSession(item.draft)
      else if (choice !== 'skip') {
        const existing = sessions.find((s) => s.id === choice.merge)
        const next = existing && fillFrom(existing, item.draft)
        if (next) saveSession(next)
      }
      patch({ review: data.review.filter((r) => r.activityId !== activityId) })
    },

    setImportFrom(importFrom) {
      patch({ importFrom })
    },

    forgetSkipped() {
      const kept = new Set([...log.sessions.map((s) => s.externalId), ...data.review.map((r) => r.activityId)].filter(Boolean))
      patch({ handled: data.handled.filter((id) => kept.has(id)), lastSync: undefined })
    },
  }

  return <StravaContext.Provider value={value}>{children}</StravaContext.Provider>
}

export function useStrava() {
  const ctx = useContext(StravaContext)
  if (!ctx) throw new Error('useStrava must be used inside StravaProvider')
  return ctx
}
