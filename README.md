# Training Tracker

Personal multi-sport training planner, logger and analysis app. See [docs/SPEC.md](docs/SPEC.md) for the agreed design and build plan.

```bash
npm install
npm run dev     # http://localhost:5173
npm run build
npm test        # unit tests (Vitest)
```

Optional connections (Google Calendar, Strava) are configured in `.env.local`; see [.env.example](.env.example).

Everything is stored in the browser. Use **Settings › Your data** to download a backup now and then, and to restore one on another device.
