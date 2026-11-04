// Talking to Strava. Sign-in uses Strava's OAuth code flow: the browser goes to Strava,
// comes back to /strava/callback with a code, and the app's own server swaps that for
// tokens (it holds the client secret, see server/stravaToken.ts). Activity reads then go
// straight from the browser to Strava's API with the access token, refreshed when it's
// close to its six-hour expiry.

const API = 'https://www.strava.com/api/v3'
const SCOPE = 'read,activity:read_all'
const STATE_KEY = 'tt-strava-state'

export interface StravaTokens {
  accessToken: string
  refreshToken: string
  /** Epoch seconds. */
  expiresAt: number
  scope?: string
}

export interface StravaAthlete {
  id: number
  firstname?: string
  lastname?: string
  profile_medium?: string
}

/** The parts of Strava's activity (summary and detailed) the import uses. */
export interface StravaLap {
  lap_index: number
  distance: number
  elapsed_time: number
  moving_time: number
  average_speed?: number
  average_heartrate?: number
  max_heartrate?: number
  average_cadence?: number
  average_watts?: number
}

export interface StravaActivity {
  id: number
  name: string
  sport_type: string
  type?: string
  /** Local wall time with a misleading "Z", e.g. "2026-11-03T07:12:00Z". */
  start_date_local: string
  elapsed_time: number
  moving_time: number
  distance: number
  total_elevation_gain?: number
  average_heartrate?: number
  max_heartrate?: number
  average_watts?: number
  weighted_average_watts?: number
  device_watts?: boolean
  average_cadence?: number
  trainer?: boolean
  manual?: boolean
  /** Run: 1 race, 2 long, 3 workout. Ride: 11 race, 12 workout. */
  workout_type?: number | null
  start_latlng?: number[] | null
  // Detailed activity only:
  description?: string | null
  private_note?: string | null
  perceived_exertion?: number | null
  laps?: StravaLap[]
}

export class RateLimited extends Error {
  constructor() {
    super('Strava’s rate limit was reached. The rest will come in on the next sync (limits reset every 15 minutes).')
  }
}

export class NotConnected extends Error {}

// ---- Server ------------------------------------------------------------------

export interface ServerStatus {
  configured: boolean
  clientId?: string
}

/** Whether this site's server can do the token exchange. A static host without it reads as not configured. */
export async function serverStatus(): Promise<ServerStatus> {
  try {
    const r = await fetch('/api/strava/status')
    if (!r.ok || !r.headers.get('content-type')?.includes('json')) return { configured: false }
    return await r.json()
  } catch {
    return { configured: false }
  }
}

async function tokenRequest(body: Record<string, string>): Promise<{ tokens: StravaTokens; athlete?: StravaAthlete }> {
  const r = await fetch('/api/strava/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await r.json().catch(() => ({}))
  if (!r.ok || !data.access_token) {
    if (r.status === 400 || r.status === 401) throw new NotConnected('Strava refused the sign-in. Connect again from Settings.')
    throw new Error(data.message ?? `Strava sign-in failed (${r.status})`)
  }
  return {
    tokens: { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at, scope: data.scope },
    athlete: data.athlete,
  }
}

// ---- Sign-in -------------------------------------------------------------------

export const redirectUri = () => `${location.origin}/strava/callback`

export function authorizeUrl(clientId: string) {
  const state = crypto.randomUUID()
  try {
    sessionStorage.setItem(STATE_KEY, state)
  } catch {
    // Without session storage the state check below is skipped.
  }
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri(), response_type: 'code', approval_prompt: 'auto', scope: SCOPE, state })
  return `https://www.strava.com/oauth/authorize?${q}`
}

/** Handles the redirect back from Strava. */
export async function finishSignIn(params: URLSearchParams) {
  if (params.get('error')) throw new Error(params.get('error') === 'access_denied' ? 'Strava access was declined.' : `Strava said: ${params.get('error')}`)
  let expected: string | null = null
  try {
    expected = sessionStorage.getItem(STATE_KEY)
    sessionStorage.removeItem(STATE_KEY)
  } catch {
    // see authorizeUrl
  }
  if (expected && params.get('state') !== expected) throw new Error('The Strava sign-in didn’t match this browser. Try connecting again.')
  const code = params.get('code')
  if (!code) throw new Error('Strava didn’t send a sign-in code.')
  const scope = params.get('scope') ?? ''
  if (!scope.includes('activity:read')) throw new Error('Activity access wasn’t allowed. Connect again and leave “View data about your activities” ticked.')
  return tokenRequest({ code })
}

export const refreshTokens = (refreshToken: string) => tokenRequest({ refresh_token: refreshToken }).then((r) => r.tokens)

export async function deauthorize(accessToken: string) {
  await fetch('/api/strava/deauthorize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: accessToken }) }).catch(() => undefined)
}

// ---- Reads -----------------------------------------------------------------------

export type TokenSource = () => Promise<string>

async function get<T>(token: TokenSource, path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${await token()}` } })
  if (r.status === 429) throw new RateLimited()
  if (r.status === 401) throw new NotConnected('Strava access has expired or been removed. Connect again from Settings.')
  if (!r.ok) throw new Error(`Strava said ${r.status}`)
  return r.json()
}

/** Every activity starting after `afterEpoch`, oldest first. */
export async function listActivities(token: TokenSource, afterEpoch: number): Promise<StravaActivity[]> {
  const out: StravaActivity[] = []
  for (let page = 1; page < 50; page++) {
    const batch = await get<StravaActivity[]>(token, `/athlete/activities?after=${afterEpoch}&per_page=100&page=${page}`)
    out.push(...batch)
    if (batch.length < 100) break
  }
  return out.sort((a, b) => a.start_date_local.localeCompare(b.start_date_local))
}

export const getActivity = (token: TokenSource, id: string) => get<StravaActivity>(token, `/activities/${id}?include_all_efforts=false`)

export const activityUrl = (id: string) => `https://www.strava.com/activities/${id}`
