import { useEffect, useSyncExternalStore } from 'react'
import { onWrite } from '../storage'
import { SYNCED, forgetBase, syncOnce, type SyncReport } from './engine'
import { SignedOut, readSession, signIn, signOut, signUp, supabaseRemote, syncConfigured } from './supabase'

// When sync runs: on opening the app, a few seconds after any change, when the app comes
// back into view or back online, and every five minutes while it's open. One tab at a
// time (Web Locks), so tabs never race each other.

export type SyncState = 'off' | 'idle' | 'syncing' | 'error'

export interface SyncStatus {
  state: SyncState
  email?: string
  lastSync?: string
  last?: SyncReport
  error?: string
}

const AFTER_EDIT_MS = 3000
const EVERY_MS = 5 * 60_000
const ON_FOCUS_AFTER_MS = 30_000

let status: SyncStatus = initial()
const listeners = new Set<() => void>()

function initial(): SyncStatus {
  const s = syncConfigured ? readSession() : undefined
  return s ? { state: 'idle', email: s.user.email } : { state: 'off' }
}

function set(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}

export function useSyncStatus() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
  )
}

let running: Promise<void> | undefined
let again = false
let timer: ReturnType<typeof setTimeout> | undefined

function withLock(fn: () => Promise<void>): Promise<void> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  return locks ? locks.request('tt-sync', fn) : fn()
}

/** Syncs now (or straight after the one already running). */
export function syncNow(): Promise<void> {
  if (!readSession()) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  clearTimeout(timer)
  set({ state: 'syncing', error: undefined })
  running = withLock(async () => {
    try {
      const report = await syncOnce(supabaseRemote)
      set({ state: 'idle', lastSync: report.at, last: report })
      // An edit was mid-save: try again shortly.
      if (report.deferred.length) schedule(AFTER_EDIT_MS)
    } catch (e) {
      if (e instanceof SignedOut) set({ state: 'off', email: undefined, error: e.message })
      else set({ state: 'error', error: (e as Error).message })
    }
  }).finally(() => {
    running = undefined
    if (again) {
      again = false
      void syncNow()
    }
  })
  return running
}

function schedule(ms: number) {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), ms)
}

export async function signInAndSync(email: string, password: string, create: boolean): Promise<'synced' | 'confirm'> {
  const session = create ? await signUp(email, password) : await signIn(email, password)
  if (!session) return 'confirm'
  // A new account (or a different one) starts from a combined copy, never from another account's base.
  forgetBase()
  set({ state: 'idle', email: session.user.email, error: undefined, last: undefined, lastSync: undefined })
  await syncNow()
  return 'synced'
}

export async function signOutOfSync() {
  await running
  await signOut()
  forgetBase()
  set({ state: 'off', email: undefined, error: undefined, last: undefined, lastSync: undefined })
}

/** Mounted once: runs sync in the background while signed in. */
export function SyncRunner() {
  useEffect(() => {
    if (!syncConfigured) return
    void syncNow()
    const off = onWrite((key) => {
      // Sync's own writes come while it's running; only edits made in the app count.
      if (!running && (SYNCED as string[]).includes(key)) schedule(AFTER_EDIT_MS)
    })
    const stale = () => !status.lastSync || Date.now() - new Date(status.lastSync).getTime() > ON_FOCUS_AFTER_MS
    const onVisible = () => {
      if (document.visibilityState === 'visible' && stale()) void syncNow()
    }
    const onOnline = () => void syncNow()
    document.addEventListener('visibilitychange', onVisible)
    addEventListener('online', onOnline)
    const every = setInterval(() => {
      if (document.visibilityState === 'visible') void syncNow()
    }, EVERY_MS)
    return () => {
      off()
      document.removeEventListener('visibilitychange', onVisible)
      removeEventListener('online', onOnline)
      clearInterval(every)
      clearTimeout(timer)
    }
  }, [])
  return null
}
