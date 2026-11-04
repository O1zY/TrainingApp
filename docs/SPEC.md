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
| Look | Auto light/dark following the device, with manual override. Two quiet colours + one loud: oat (warm paper) and ink (deep blue-black, used in solid blocks like the sidebar and today), with violet as the loud main colour. Bricolage Grotesque for headings and big numbers, Figtree for text (agreed 4 Nov 2026) |
| Units | User-selectable; default metric (km, kg). Rowing splits always /500m |
| Week | Starts Monday by default (setting) |
| Stack | React + TypeScript + Vite + Tailwind v4; Supabase for data/auth when the data sections start |
| Existing project | Deliberately ignored so it doesn't bias the design. On 4 Nov 2026 linking it (an earlier artifact) was parked: section 7 became making the app solid instead |

## Build sections (one per session)

1. **App shell + navigation** ✅ — layout, theme tokens, sidebar (laptop) / tab bar (phone), dashboard skeleton, settings
2. **Session logging** ✅ — fast entry per sport, sport-specific fields, RPE/notes
3. **Session library** ✅ — reusable workouts/templates, log-from-template
4. **Programme planner** ✅ — blocks → weeks → sessions, target races, schedule around work
5. **Analysis** ✅ — training load, PBs, planned vs completed, per-sport trends
6. **Strava import** ✅ — OAuth + activity sync, dedupe against manual logs
7. **Solid foundations** ✅ — safe storage, backup/restore, crash guard, faster loading, unit tests (replaced "link to existing project", now parked)
8. **Wellbeing vs load** ✅ — which check-in scores move with training load (Analysis)
9. **Planned sessions → Google Calendar** ✅ — write the plan out to a calendar of its own
10. **Sync across devices** — one copy of the data in a database, shared by phone and laptop

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
| Calendars | Manual shifts (with weekly repeat), .ics import (daily/weekly repeats expanded) and read-only Google Calendar sync in the browser (the plan can also be written out, see below) (needs `VITE_GOOGLE_CLIENT_ID`, see `.env.example`). Titles matching work keywords become shifts; the rest is busy time. Edits to imported items survive re-syncs |
| Re-planning | Automatic after saving shifts, events or the block; by hand from Plan. Logged, past, moved or edited sessions are never replaced |
| Logging | `/log/new?plan=id` pre-fills from the planned workout; the session keeps `planId` for planned vs done in Analysis |

## Analysis decisions (4 Nov 2026)

| Topic | Decision |
|---|---|
| Range | 4 weeks, 12 weeks (default), 6 months or 1 year, in whole weeks from the week-start setting |
| What counts | Completed sessions only; multisport transitions are left out. `counted()` in `src/analysis/load.ts` |
| Training load | Session-RPE load per day (RPE × minutes). Fitness = 42-day and fatigue = 7-day exponentially weighted averages, form = fitness − fatigue. Acute:chronic = fatigue ÷ fitness, banded <0.8 low, 0.8–1.3 sweet spot, 1.3–1.5 building fast, >1.5 spike. Sessions without an RPE add no load and are counted in a note. Logic: `src/analysis/load.ts` |
| Planned vs done | Planned sessions that are due (dated before today, or logged): done (a log with its `planId`), skipped on purpose, or missed. Shows % sessions, % key/race sessions, % planned time, off-plan sessions (recovery not counted), a weekly done/skipped/missed chart and the latest misses. Logic: `src/analysis/weekly.ts` |
| Per-sport trends | Small multiples, one row per sport in a fixed order, of weekly time, distance or load, with total and second-half vs first-half change; plus average pace per week for erg, water, run, bike and swim |
| PBs | Fastest time over standard distances per sport (erg 500m–half marathon, water 1k/2k/5k, run 1k–marathon, bike 10/20/40k, swim 100–1500m) from a whole session or a single piece within 1.5% of the distance, scaled to the exact distance. Water and erg kept apart. "New" if set in the last 28 days and beating an earlier attempt. Lifts: best Epley e1RM (≤12 reps) and heaviest weight, with an e1RM trend. Logic: `src/analysis/pbs.ts` |
| Charts | Hand-rolled SVG/HTML in `src/components/charts.tsx`, no chart library. One axis per chart; every chart has a hover/keyboard readout and a legend or labels, so nothing relies on colour alone (the sport colours aren't colour-blind safe next to each other, which is why per-sport views are labelled rows, not stacks) |

## Strava import decisions (4 Nov 2026)

| Topic | Decision |
|---|---|
| Sign-in | Strava OAuth code flow. Strava needs the client secret to swap the code for tokens and to refresh them, so a small handler on the dev/preview server does that (`server/stravaToken.ts`, `/api/strava/*`), reading `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` from `.env.local` (no `VITE_` prefix, never in the bundle). The same handler can become a serverless function when the app is hosted. Activity reads go straight from the browser to Strava. Scope `read,activity:read_all` |
| Storage | `tt-strava-v1` in localStorage: tokens, athlete, import-from date, ids already dealt with, activities still waiting for details, the review queue. `src/strava/StravaStore.tsx` is the only file that touches it; sessions go through the log store |
| Sync | Automatic when the app opens (at most every 30′), or "Sync now" on Log › Strava. First sync lists from the import-from date (default 12 weeks back; moving it earlier backfills), later ones from the last sync minus 3 days for late uploads. Up to 60 detail reads per sync (laps, description, private note, perceived exertion); the rest are imported from the list and filled in on later syncs. Rate limits stop the details, not the import |
| Mapping | Rowing without GPS (or trainer/virtual) → erg, with GPS → on-water. Run/Ride variants → run/bike, virtual or trainer = indoor. Swim pool/open from GPS. Weight training/CrossFit/HIIT → strength; yoga/Pilates/walk → recovery; the rest → other. Moving time, except races (clock time). Run cadence doubled to steps/min. Strava's automatic "Morning Run"-style names are dropped. Logic: `src/strava/convert.ts` |
| Laps → pieces | Slow laps (<70% of the faster half's speed, or 0m) are rest, folded into the piece before; leading/trailing slow laps are warm-up/cool-down. Laps all one standard distance (500m, 1k, 1mi, 5k, 10k), or all one time with no rest, are auto-splits and don't become pieces |
| Dedupe | A manual session is a candidate on the same day in a compatible sport (erg ≈ on-water; "other" weak), unless start times are 3h+ apart, durations 50%+ (not for strength) or distances 25%+. Close start (≤30′/≤90′), duration (≤10%/≤25%) and distance (≤3%/≤10%) score 2/1. Auto-merge when score ≥3 and 2+ clear of the next candidate, or when it's the only candidate both ways round in the same sport; otherwise "To check" (same session / import as new / skip). Logic: `src/strava/match.ts` |
| Merging | Never overwrites what was typed: empty fields filled, laps become pieces only if none were logged, equal-count pieces get missing HR/watts/rate. The session keeps `source: 'manual'` and gains `externalId`. Strava-only sessions not edited since import are replaced wholesale when their details arrive |
| Multisport | Watches upload a duathlon/triathlon as one activity per leg. Same-day activities chain when each starts within 15′ of the last finishing (clock time, a minute's overlap allowed); run → bike → run becomes a duathlon and swim → bike → run a triathlon, found anywhere in the chain (so a warm-up jog before is ignored). Legs keep their clock (elapsed) time so the transitions come out of the gaps. A duathlon/triathlon already logged by hand that day with the same legs is filled in leg by leg; otherwise the legs are imported and grouped into a new event. A plan race that day of that kind gives the event its name, marks it a race and ticks off the race's planned session. Legs are never matched against loose single sessions. Bricks (bike → run) aren't grouped. Logic: `src/strava/multisport.ts` |
| Plan | A new activity on a day with exactly one unlogged, unskipped planned session in that sport gets its `planId` (and `workoutId`), so it counts as done in Analysis |
| Deletes | Deleted imports and skipped activities stay out on later syncs; "Bring back skipped activities" lets them return |
| Branding | "View on Strava" links in Strava orange (`text-strava` token) on imported sessions and review items, per Strava's guidelines |
| Not yet | HR zone times (needs a zones call per activity), streams, writing back to Strava, webhooks (need a public server) |

## Solid foundations decisions (4 Nov 2026)

| Topic | Decision |
|---|---|
| Storage | Every store reads and writes through `src/storage.ts` (`useStoredState`). Keys: `tt-settings`, `tt-log-v1`, `tt-plan-v1`, `tt-strava-v1` (`KEYS`). Saved fields of the wrong shape (e.g. `sessions` not an array) fall back to their default (`withArrays`) |
| Unreadable saves | Copied to `<key>.corrupt-<time>` before anything can overwrite them, and a banner says so. Nothing is ever silently replaced |
| Failed saves | If the browser refuses a write (full, private mode) a banner stays up saying changes aren't being saved, pointing at the backup |
| Tabs | A save in one tab is picked up by the others (`storage` event), so two open tabs don't overwrite each other |
| Backups | Settings › Your data: download one JSON file of every store, restore from one (preview of what's in it, then all-or-nothing replace and reload). Strava tokens are never in the file; a restore keeps the current connection. `tt-meta` remembers the last backup; Home nudges once 5+ sessions are logged and there's been no backup for 14 days. Logic: `src/backup.ts` |
| Persistence | `navigator.storage.persist()` asked on each visit; Settings shows whether the browser has agreed and how much is used |
| Crashes | An error boundary per page (reset on navigation) shows what went wrong with Reload / Download backup, keeping the nav usable; a top-level one covers the stores |
| Loading | Pages are lazy-loaded per route; first load went from 539 kB to 248 kB of JS |
| Tests | Vitest (`npm test`) on the pure logic: storage, backups, time/pace/watts formatting, training load, the build/deload cycle, Strava sport mapping, laps → pieces, dedupe scoring and multisport grouping |

## Wellbeing vs load decisions (4 Nov 2026)

| Topic | Decision |
|---|---|
| Pairing | Each check-in in the Analysis range is set against the load before it (check-ins are taken as morning ones): the day before's load, and the 7-day weighted load (fatigue) to the day before. Check-ins before the first logged load are left out; after it, a day with nothing logged is rest |
| Measures | Wellness score, sleep hours and quality, resting HR, HRV, energy, mood, motivation, soreness, tiredness, stress, each with which way is good |
| Links | Spearman rank correlation per measure × (day before, 7-day), shown when there are 10+ pairs and \|r\| ≥ 0.2, banded weak / moderate / strong at 0.2 / 0.4 / 0.6, strongest first, in plain English ("Soreness is clearly higher the morning after a bigger day") marked good sign / worth watching. Worded as going together, never as cause |
| Morning after | Average of a chosen measure after rest, light, moderate and hard days; light/moderate/hard are thirds of the athlete's own non-zero daily loads in the range |
| Logic | `src/analysis/wellbeing.ts` (tested) |

## Plan → Google Calendar decisions (4 Nov 2026)

| Topic | Decision |
|---|---|
| Where | A calendar of its own, “Training plan”, made by the app. Scope `calendar.app.created`: the app can only see and change calendars it made, never the rest of the account. Asked for only when sending the plan out; reading shifts still asks for read-only. Both share one in-memory token |
| What | Planned sessions from today on, not skipped. With a time: booked for their length (an hour if unknown), marked busy. Without: an all-day event marked free. Key sessions Grape (violet), races Tomato, the rest the calendar's colour. Logged sessions get “✓”. Description: intensity · sport · length, workout structure, notes, why that day, link back to the session |
| Updates | Each event carries the planned session's id and a fingerprint of its contents (private extended properties), so “Update calendar” reads the calendar and only sends what changed: adds, updates, and removes events from today on that no longer match (skipped, deleted, re-planned away, duplicates). Past events are left as a record. Works the same from any device. A calendar deleted in Google is made again on the next update. Sends four at a time with backoff on rate limits |
| Auto-update | Optional (“Keep it updated as the plan changes”): a few seconds after the plan or log changes, re-sends, but only while Google access is live in that tab, so it never pops a sign-in up by itself |
| Code | Mapping and diff `src/plan/calendarOut.ts` (tested); API calls `src/plan/calendar.ts`; `src/plan/pushPlan.ts`; watcher `src/plan/CalendarAutoPush.tsx` (loads the push code only when it fires); UI in Plan › Work & calendar |

## Parked for later (noted 23 Oct 2026)

- **Link to the existing project** (an earlier artifact). Parked 4 Nov 2026 in favour of making this app solid first.

- **Garmin import** for the morning check-in (no personal-use API); revisit later.
- **Adaptive coaching.** The miss thresholds in `src/log/targets.ts` are a flat start. A later coaching
  feature should learn from logged sessions and check-ins and adjust how strictly reps are judged:
  harsher when there's room to push, more forgiving after poor sleep, high soreness or a fading block.

## Conventions

- All colours come from tokens in `src/index.css` (`bg-surface`, `text-muted`, `bg-accent`, `text-sport-row`, …). Each discipline has its own colour token for logs, plans and charts.
- Shared UI pieces live in `src/components/ui.tsx`; nav items in `src/layout/nav.ts`.
- Settings are in `src/settings/SettingsContext.tsx` (localStorage until Supabase arrives).
