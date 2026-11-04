# Training Tracker

Personal multi-sport training planner, logger and analysis app. See [docs/SPEC.md](docs/SPEC.md) for the agreed design and build plan.

```bash
npm install
npm run dev     # http://localhost:5173
npm run build
npm test        # unit tests (Vitest)
```

Optional connections (Google Calendar, Strava, sync) are configured in `.env.local`; see [.env.example](.env.example).

Everything is stored in the browser. Use **Settings › Your data** to download a backup now and then, and to restore one on another device.

## Sync across devices

To keep phone and laptop in step, give the app a free [Supabase](https://supabase.com) project of your own:

1. Create a project, open **SQL Editor › New query**, paste in [supabase/schema.sql](supabase/schema.sql) and run it.
2. In **Project Settings › API**, copy the project URL and the anon (publishable) key into `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Under **Authentication › Sign In / Providers › Email**, either turn off "Confirm email", or leave it on and set **Authentication › URL Configuration › Site URL** to where you open the app (e.g. `http://localhost:5173`) so the confirmation link lands somewhere that works.
4. Restart `npm run dev`, then **Settings › Sync across devices** on each device and sign in with the same email.

## Plan → Google Calendar

With `VITE_GOOGLE_CLIENT_ID` set, **Plan › Work & calendar › Send plan to Google Calendar** writes your planned sessions into a calendar of their own ("Training plan"). The app can only touch calendars it made, never your others.
