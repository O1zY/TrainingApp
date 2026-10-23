# Training Tracker — spec

A personal training database and tracker: part "own Strava" (a feed of everything done),
part training tool (plan programmes, reuse sessions, analyse progress) across every sport.

## Decisions (agreed 23 Oct 2026)

| Topic | Decision |
|---|---|
| Platform | Web app, works equally well on phone and laptop |
| Sports | Everything: rowing (water + erg), running, cycling, strength/CrossFit, recovery/wellbeing, open to more |
| Core jobs | Plan programmes · Log sessions · Analyse progress · Session library |
| Data in | Manual logging + Strava import (no double entry) |
| Navigation | Dashboard home + tabs: Home · Plan · Log · Library · Analysis (Settings via gear) |
| Look | Auto light/dark following the device, with manual override |
| Units | User-selectable; default metric (km, kg). Rowing splits always /500m |
| Week | Starts Monday by default (setting) |
| Stack | React + TypeScript + Vite + Tailwind v4; Supabase for data/auth when the data sections start |
| Existing project | Deliberately ignored for now so it doesn't bias the design; linking is a late, separate section |

## Build sections (one per session)

1. **App shell + navigation** ✅ — layout, theme tokens, sidebar (laptop) / tab bar (phone), dashboard skeleton, settings
2. **Session logging** ✅ — fast entry per sport, sport-specific fields, RPE/notes
3. **Session library** — reusable workouts/templates, log-from-template
4. **Programme planner** — blocks → weeks → sessions, target races, schedule
5. **Analysis** — training load, PBs, planned vs completed, per-sport trends
6. **Strava import** — OAuth + activity sync, dedupe against manual logs
7. **Link to existing project** — scope decided at that point

## Session logging decisions (agreed 23 Oct 2026)

| Topic | Decision |
|---|---|
| Storage | localStorage for now (`src/log/LogStore.tsx` is the only file that touches it) |
| Intervals | Every piece logged individually: distance, time, split/pace, rate, watts, HR, rest, notes |
| Strength | Individual sets (kg, reps, RPE, warm-up flag); log by % of 1RM for lifts with a saved 1RM. 1RM is copied onto each exercise so old %s stay correct |
| Boat/seat | Not tracked; on-water detail will mostly come from Strava |
| Wellbeing | Daily check-in (sleep, RHR, HRV, weight, 1–5 scales, illness/injury), kept alongside training for later correlation |
| Effort | RPE 1–10 (CR10 labels), session load = RPE × minutes, optional time in HR zones Z1–Z5 |
| Multisport | Legs are normal sessions linked by `multisportId`. Transitions are worked out from one leg's finish to the next leg's start unless logged as a `transition` leg |
| After save | Goes to that session's detail view |
| Edit/delete | Included for sessions, multisport events, check-ins and 1RMs |

All data is stored metric (m, s, kg) and converted for display. Splits/pace are never stored — they are derived from distance + time.

## Conventions

- All colours come from tokens in `src/index.css` (`bg-surface`, `text-muted`, `bg-accent`, `text-sport-row`, …). Each discipline has its own colour token for logs, plans and charts.
- Shared UI pieces live in `src/components/ui.tsx`; nav items in `src/layout/nav.ts`.
- Settings are in `src/settings/SettingsContext.tsx` (localStorage until Supabase arrives).
