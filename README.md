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

## Hosting on Netlify

So your phone can use the app (and sync) anywhere. `netlify.toml` holds the build settings.

1. On [netlify.com](https://netlify.com), **Add new project › Import an existing project › GitHub**, and pick this repo. Leave the build settings as they come.
2. Under **Environment variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as `.env.local`), and optionally `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` and `VITE_GOOGLE_CLIENT_ID`. Then deploy.
3. In Supabase, **Authentication › URL Configuration**: set **Site URL** to the Netlify address.
4. Strava (if used): at https://www.strava.com/settings/api set **Authorization Callback Domain** to the Netlify host (e.g. `my-app.netlify.app`). Localhost keeps working.
5. Google Calendar (if used): add the Netlify address to the OAuth client's **Authorised JavaScript origins**.

Changing an environment variable needs a new deploy (**Deploys › Trigger deploy**) to take effect.

## Plan → Google Calendar

With `VITE_GOOGLE_CLIENT_ID` set, **Plan › Work & calendar › Send plan to Google Calendar** writes your planned sessions into a calendar of their own ("Training plan"). The app can only touch calendars it made, never your others.
