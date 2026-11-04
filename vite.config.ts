import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { stravaToken } from './server/stravaToken.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // '' loads every variable, not just VITE_ ones: the Strava secret stays on the server.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), stravaToken({ clientId: env.STRAVA_CLIENT_ID, clientSecret: env.STRAVA_CLIENT_SECRET })],
  }
})
