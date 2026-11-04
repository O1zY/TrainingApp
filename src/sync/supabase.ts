import { readJson, writeJson } from '../storage'
import type { Remote, Row } from './engine'

// The account behind sync: Supabase (Postgres + auth), spoken to over its REST APIs so
// there's no SDK in the bundle. The project URL and anon key are public by design; row
// level security (supabase/schema.sql) means each signed-in person can only ever read or
// write their own rows. The session (access + refresh token) is kept in `tt-sync` on this
// device and never goes in a backup.

const URL_: string | undefined = import.meta.env.VITE_SUPABASE_URL
const ANON: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY

export const syncConfigured = !!URL_ && !!ANON

export const SESSION_KEY = 'tt-sync'

export interface AuthSession {
  accessToken: string
  refreshToken: string
  /** Unix seconds. */
  expiresAt: number
  user: { id: string; email?: string }
}

interface SyncMeta {
  session?: AuthSession
}

export const readSession = () => readJson<SyncMeta>(SESSION_KEY, (s) => s as SyncMeta).session
const saveSession = (session: AuthSession | undefined) => writeJson(SESSION_KEY, { ...readJson<SyncMeta>(SESSION_KEY, (s) => s as SyncMeta), session })

interface GoTrueSession {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  expires_at?: number
  user?: { id: string; email?: string }
  error_description?: string
  msg?: string
  message?: string
  error?: string
}

async function auth(path: string, body: unknown, token?: string): Promise<GoTrueSession> {
  if (!syncConfigured) throw new Error('Sync isn’t set up: add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
  let res: Response
  try {
    res = await fetch(`${URL_}/auth/v1${path}`, {
      method: 'POST',
      headers: { apikey: ANON!, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Couldn’t reach the sync server. Are you online?')
  }
  const data = (await res.json().catch(() => ({}))) as GoTrueSession
  if (!res.ok) throw new Error(data.error_description ?? data.msg ?? data.message ?? `Sign-in failed (${res.status})`)
  return data
}

function toSession(d: GoTrueSession): AuthSession | undefined {
  if (!d.access_token || !d.refresh_token || !d.user) return undefined
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiresAt: d.expires_at ?? Math.floor(Date.now() / 1000) + (d.expires_in ?? 3600),
    user: { id: d.user.id, email: d.user.email },
  }
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const s = toSession(await auth('/token?grant_type=password', { email, password }))
  if (!s) throw new Error('Sign-in failed')
  saveSession(s)
  return s
}

/** Makes an account. Returns the session, or undefined when the email must be confirmed first. */
export async function signUp(email: string, password: string): Promise<AuthSession | undefined> {
  const d = await auth('/signup', { email, password })
  const s = toSession(d)
  if (s) saveSession(s)
  return s
}

export async function signOut() {
  const s = readSession()
  saveSession(undefined)
  if (s) await auth('/logout', {}, s.accessToken).catch(() => undefined)
}

export class SignedOut extends Error {}

/** A live access token, refreshing it if it's about to expire. */
async function token(): Promise<string> {
  // Re-read each time: another tab may have refreshed (and so replaced) the tokens.
  const s = readSession()
  if (!s) throw new SignedOut('Not signed in')
  if (s.expiresAt * 1000 > Date.now() + 60_000) return s.accessToken
  let d: GoTrueSession
  try {
    d = await auth('/token?grant_type=refresh_token', { refresh_token: s.refreshToken })
  } catch (e) {
    if ((e as Error).message.startsWith('Couldn’t reach')) throw e
    saveSession(undefined)
    throw new SignedOut('Signed out: please sign in again')
  }
  const next = toSession(d)
  if (!next) throw new SignedOut('Signed out: please sign in again')
  saveSession(next)
  return next.accessToken
}

const TABLE = 'tt_store'

async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<Response> {
  const t = await token()
  let res: Response
  try {
    res = await fetch(`${URL_}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: ANON!, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(init.prefer ? { Prefer: init.prefer } : {}) },
    })
  } catch {
    throw new Error('Couldn’t reach the sync server. Are you online?')
  }
  if (res.status === 401) {
    saveSession(undefined)
    throw new SignedOut('Signed out: please sign in again')
  }
  return res
}

async function fail(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { message?: string }
  throw new Error(`Sync server said ${res.status}${body.message ? `: ${body.message}` : ''}`)
}

/** The signed-in account's rows, as the sync engine wants them. */
export const supabaseRemote: Remote = {
  async pull(): Promise<Row[]> {
    const res = await rest(`${TABLE}?select=key,data,rev`)
    if (!res.ok) await fail(res)
    return res.json()
  },
  async push(key, data, expectRev) {
    if (expectRev === 0) {
      const res = await rest(TABLE, { method: 'POST', prefer: 'return=minimal', body: JSON.stringify({ key, data, rev: 1 }) })
      if (res.status === 409) return false // Another device got there first.
      if (!res.ok) await fail(res)
      return true
    }
    const q = new URLSearchParams({ key: `eq.${key}`, rev: `eq.${expectRev}` })
    const res = await rest(`${TABLE}?${q}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: JSON.stringify({ data, rev: expectRev + 1, updated_at: new Date().toISOString() }),
    })
    if (!res.ok) await fail(res)
    const rows = (await res.json()) as unknown[]
    return rows.length === 1
  },
}
