import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'

// Strava's OAuth needs the client secret to swap a sign-in code for tokens and to refresh
// them, so that step can't happen in the browser. This tiny handler does it on the dev and
// preview servers, with the secret read from STRAVA_CLIENT_SECRET (no VITE_ prefix, so it
// never ends up in the bundle). Everything else talks to Strava straight from the browser.
//
//   GET  /api/strava/status        → { configured, clientId }
//   POST /api/strava/token         { code } or { refresh_token } → Strava's token response
//   POST /api/strava/deauthorize   { access_token } → revokes the app's access
//
// The same `handle` function can be dropped into a serverless function when the app is hosted.

const STRAVA = 'https://www.strava.com'

export interface StravaServerEnv {
  clientId?: string
  clientSecret?: string
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    return {}
  }
}

async function forward(res: ServerResponse, url: string, params: Record<string, string>) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) })
    const text = await r.text()
    res.statusCode = r.status
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(text || '{}')
  } catch (e) {
    send(res, 502, { message: `Could not reach Strava: ${(e as Error).message}` })
  }
}

export async function handle(env: StravaServerEnv, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = (req.url ?? '').split('?')[0]
  if (!path.startsWith('/api/strava/')) return false
  const configured = !!env.clientId && !!env.clientSecret

  if (path === '/api/strava/status' && req.method === 'GET') {
    send(res, 200, { configured, clientId: configured ? env.clientId : undefined })
    return true
  }
  if (req.method !== 'POST') {
    send(res, 405, { message: 'Method not allowed' })
    return true
  }
  if (!configured) {
    send(res, 503, { message: 'Strava is not set up on the server: add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET to .env.local' })
    return true
  }

  const body = await readJson(req)
  if (path === '/api/strava/token') {
    const client = { client_id: env.clientId!, client_secret: env.clientSecret! }
    if (typeof body.code === 'string') return forward(res, `${STRAVA}/oauth/token`, { ...client, code: body.code, grant_type: 'authorization_code' }).then(() => true)
    if (typeof body.refresh_token === 'string')
      return forward(res, `${STRAVA}/oauth/token`, { ...client, refresh_token: body.refresh_token, grant_type: 'refresh_token' }).then(() => true)
    send(res, 400, { message: 'Send a code or a refresh_token' })
    return true
  }
  if (path === '/api/strava/deauthorize' && typeof body.access_token === 'string') {
    await forward(res, `${STRAVA}/oauth/deauthorize`, { access_token: body.access_token })
    return true
  }
  send(res, 404, { message: 'Not found' })
  return true
}

export function stravaToken(env: StravaServerEnv): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    handle(env, req, res).then((done) => done || next(), next)
  }
  return {
    name: 'strava-token',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  }
}
