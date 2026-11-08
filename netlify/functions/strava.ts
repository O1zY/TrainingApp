import { parseJson, respond } from '../../server/stravaToken.ts'

// The hosted site's Strava token exchange (see server/stravaToken.ts). Set STRAVA_CLIENT_ID and
// STRAVA_CLIENT_SECRET in Netlify › Site configuration › Environment variables.
export default async (req: Request): Promise<Response> => {
  const env = { clientId: process.env.STRAVA_CLIENT_ID, clientSecret: process.env.STRAVA_CLIENT_SECRET }
  const reply = (await respond(env, req.method, new URL(req.url).pathname, async () => parseJson(await req.text()))) ?? { status: 404, body: '{"message":"Not found"}' }
  return new Response(reply.body, { status: reply.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}

export const config = { path: '/api/strava/*' }
