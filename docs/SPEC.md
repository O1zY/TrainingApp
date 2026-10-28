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
3. **Session library** ✅ — reusable workouts/templates, log-from-template
4. **Programme planner** ✅ — blocks → weeks → sessions, target races, schedule around work
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

## Targets (ported from the friendly-galileo branch, 23 Oct 2026)

Reps (`Piece`) and whole sessions can carry an `Aim`: a `target` (pace, watts, HR or rate, as a range or
one-sided “this or better”), an `hrZone` (1–5) and a `targetRate`. Pace targets are stored in s/km for
every sport and shown as /500m, /100m, /km, /mi or speed. Logic: `src/log/targets.ts`; UI: `src/components/targets.tsx`.

Each rep is graded **on target** (green), **harder than target** (amber) or **missed** (red, shading from
light to deep; fully red at 2% off for rowing splits, 3% other pace, 5% watts/HR, 7% rate). The session page
shows a rep strip with an HR bar per rep (target zone shaded), “x/y on target”, “x/y in HR zone” and first→last
rep drift. HR zones live in Settings (max HR, editable zone tops, default 60/70/80/90% of max).

## Session library decisions (agreed 23 Oct 2026)

| Topic | Decision |
|---|---|
| Contents | Structure + targets, strength templates by % of 1RM (or fixed weight), tags, description, source/reference |
| Starter set | None. Built up later from research and Ollie's own sessions; `source` records where each came from |
| Rep editing | Edited as sets of identical reps (“8 × 500m, 2′ rest”), stored flat as `PieceTemplate`s |
| Log from template | `/log/new?workout=id` pre-fills targets, rest, the fixed side of each rep (distance *or* time) and % sets turned into kg from the current 1RM (rounded to 2.5kg). The session keeps `workoutId` |
| Save to library | Any logged session → its structure and targets (not results) |
| History | Each workout lists the sessions logged from it, for comparing attempts and later planned-vs-done |

## Programme planner decisions (agreed 28 Oct 2026)

| Topic | Decision |
|---|---|
| Storage | localStorage, `tt-plan-v1`; `src/plan/PlanStore.tsx` is the only file that touches it |
| Cycle | 3 build weeks + 1 deload by default (2:1 and 4:1 selectable). Build weeks add volume (default +8%/week); deload at 60% with one test. Logic: `src/plan/cycle.ts` |
| Races | A: taper week before, race week, recovery week after, rhythm restarts. B: lighter race week, rhythm carries on. C: trained through, replaces a hard session. A deload due the week before a taper is skipped |
| Events | Away 4+ days in a week makes it the deload (rhythm restarts). Busy spells keep hard sessions off those days. Any week's type can be set by hand |
| Session mix | Benchmark library workouts recur at the same build week and slot every cycle, so attempts compare. Tests (type Test or #test) close each deload. The rest is a seeded mix of other library workouts (block's library %, default 40) and one-offs from `src/plan/oneOffs.ts`, which rotate weekly and scale with week volume. Library workouts are never scaled |
| Outside load | Shifts have a demand level (desk 5, on feet 15, physical 25, heavy 35 load units/hour, plus penalties for early, late, night and 10h+ shifts). Hard sessions go on the least-loaded days, not back to back, not before races; before work if the morning allows, otherwise after. Either side of every shift the planner keeps travel time (asked when building a block, default 20′ each way) plus a refuel gap (default 30′): to shower and eat after a session before leaving, and to get home and eat before training after work. Easy sessions shorten to fit. 45h+/55h+ work weeks drop 1/2 easy sessions and cut easy volume. Starting heuristics in `src/plan/load.ts`, for the coaching feature to tune |
| Calendars | Manual shifts (with weekly repeat), .ics import (daily/weekly repeats expanded) and read-only Google Calendar sync in the browser (needs `VITE_GOOGLE_CLIENT_ID`, see `.env.example`). Titles matching work keywords become shifts; the rest is busy time. Edits to imported items survive re-syncs |
| Re-planning | Automatic after saving shifts, events or the block; by hand from Plan. Logged, past, moved or edited sessions are never replaced |
| Logging | `/log/new?plan=id` pre-fills from the planned workout; the session keeps `planId` for planned vs done in Analysis |

## Parked for later (noted 23 Oct 2026)

- **Garmin import** for the morning check-in (no personal-use API); revisit later.
- **Outward calendar sync.** Writing planned sessions back into Google Calendar.
- **Adaptive coaching.** The miss thresholds in `src/log/targets.ts` are a flat start. A later coaching
  feature should learn from logged sessions and check-ins and adjust how strictly reps are judged:
  harsher when there's room to push, more forgiving after poor sleep, high soreness or a fading block.

## Conventions

- All colours come from tokens in `src/index.css` (`bg-surface`, `text-muted`, `bg-accent`, `text-sport-row`, …). Each discipline has its own colour token for logs, plans and charts.
- Shared UI pieces live in `src/components/ui.tsx`; nav items in `src/layout/nav.ts`.
- Settings are in `src/settings/SettingsContext.tsx` (localStorage until Supabase arrives).
