import type { IncomingMessage } from 'node:http'
import type { Connect, Plugin } from 'vite'

// Strava's OAuth needs the client secret to swap a sign-in code for tokens and to refresh
// them, so that step can't happen in the browser. This tiny handler does it, with the secret
// read from STRAVA_CLIENT_SECRET (no VITE_ prefix, so it never ends up in the bundle).
// Everything else talks to Strava straight from the browser.
//
//   GET  /api/strava/status        → { configured, clientId }
//   POST /api/strava/token         { code } or { refresh_token } → Strava's token response
//   POST /api/strava/deauthorize   { access_token } → revokes the app's access
//
// `respond` is shared: the Vite dev/preview servers use it through the plugin below, and the
// hosted site through netlify/functions/strava.ts.

const STRAVA = 'https://www.strava.com'

export interface StravaServerEnv {
  clientId?: string
  clientSecret?: string
}

export interface Reply {
  status: number
  /** JSON text. */
  body: string
}

const json = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) })

async function forward(url: string, params: Record<string, string>): Promise<Reply> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) })
    return { status: r.status, body: (await r.text()) || '{}' }
  } catch (e) {
    return json(502, { message: `Could not reach Strava: ${(e as Error).message}` })
  }
}

/** Answers one /api/strava/* request, or undefined when the path isn't ours. */
export async function respond(env: StravaServerEnv, method: string, path: string, readBody: () => Promise<Record<string, unknown>>): Promise<Reply | undefined> {
  if (!path.startsWith('/api/strava/')) return undefined
  const configured = !!env.clientId && !!env.clientSecret

  if (path === '/api/strava/status' && method === 'GET') return json(200, { configured, clientId: configured ? env.clientId : undefined })
  if (method !== 'POST') return json(405, { message: 'Method not allowed' })
  if (!configured) return json(503, { message: 'Strava is not set up on the server: add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET' })

  const body = await readBody()
  if (path === '/api/strava/token') {
    const client = { client_id: env.clientId!, client_secret: env.clientSecret! }
    if (typeof body.code === 'string') return forward(`${STRAVA}/oauth/token`, { ...client, code: body.code, grant_type: 'authorization_code' })
    if (typeof body.refresh_token === 'string') return forward(`${STRAVA}/oauth/token`, { ...client, refresh_token: body.refresh_token, grant_type: 'refresh_token' })
    return json(400, { message: 'Send a code or a refresh_token' })
  }
  if (path === '/api/strava/deauthorize' && typeof body.access_token === 'string') return forward(`${STRAVA}/oauth/deauthorize`, { access_token: body.access_token })
  return json(404, { message: 'Not found' })
}

export const parseJson = (text: string): Record<string, unknown> => {
  try {
    const v: unknown = JSON.parse(text || '{}')
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

async function readNodeBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return parseJson(Buffer.concat(chunks).toString('utf8'))
}

export function stravaToken(env: StravaServerEnv): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    respond(env, req.method ?? 'GET', (req.url ?? '').split('?')[0], () => readNodeBody(req)).then((reply) => {
      if (!reply) return next()
      res.statusCode = reply.status
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(reply.body)
    }, next)
  }
  return {
    name: 'strava-token',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  }
}
