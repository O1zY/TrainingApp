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
| Stack | React + TypeScript + Vite + Tailwind v4; Supabase for sync/auth (section 10), localStorage as the working copy |
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
10. **Sync across devices** ✅ — one copy of the data in a database, shared by phone and laptop
11. **AI coach: research-led plan builder** (in progress) — pre-plan screening, then a researched, cited block that the existing planner schedules around work
    - 11a **Screening and athlete profile** ✅
    - 11b **Duathlon/triathlon research library** ✅
    - 11c Coach engine and proposal screen (parked 24 Nov 2026: needs a paid Anthropic API key)
    - 11d **Rule-based coach** ✅ (no AI, no running cost): builds the block from the screening and the research library
12. **Fitness markers and zones** ✅ — threshold numbers per sport, kept with their history, that turn "zone 4" into a real pace or wattage on every planned session
13. **Weekly review and adapting the plan** ✅ — a Sunday look back that proposes changes to the weeks ahead, plus a morning check that can swap a hard day for an easy one. Built after 12, so its rules can talk about targets

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
| Starter set | An optional set of 26 triathlon/duathlon sessions, added in one tap from the Library page (`src/library/starter.ts`, 25 Nov 2026): Brownlee, Yee and Norwegian-block sessions as published, the three field tests that set the markers (CSS, 20′ FTP, 30′ run), basic easy/long/strength/mobility sessions. Fixed ids, so adding twice or on two devices never duplicates; the offer disappears once any are in. `source` says where each came from and what was scaled |
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

## Sync across devices decisions (4 Nov 2026)

| Topic | Decision |
|---|---|
| Service | Supabase (as planned in the stack), the person's own free project. Spoken to over its REST APIs, no SDK. `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (public by design). Schema in `supabase/schema.sql` |
| Account | Email + password (Supabase Auth). Session in `tt-sync` on the device, never in backups; refreshed on demand, re-read before each refresh so tabs don't clash. Signing out stops syncing and keeps everything in the browser |
| Shape | One row per store per person (`tt_store`: user, key, JSON data, `rev`). Row level security: own rows only. A trigger only lets `rev` go up by one. localStorage stays the working copy, so the app works offline exactly as before |
| Writes | Conditional: a device writes revision n+1 only if the row is still at n (PATCH filtered on `rev`); first writes are inserts (409 = someone got there first). Losing a race means pull, merge again on top, retry (up to 4 times) |
| Merge | Three-way against `tt-sync-base` (the copy and revision this device last agreed with the account). Objects key by key; record lists by `id` (`date` for check-ins, `exercise` for 1RMs): adds on either side kept, deletes carried over, an edit beats a delete; plain lists as sets; a real clash on one value goes to the later `updatedAt`, else this device. With no base (signing in on a device that already has data) both copies are combined and the account wins clashes. Logic `src/sync/merge.ts`, `src/sync/engine.ts` (tested with two fake devices) |
| Live updates | Sync applies merged data through `replaceStored` (`src/storage.ts`), which updates the open pages at once and refuses while an edit is mid-save (that store waits for the next round), so nothing typed is overwritten |
| Strava | Tokens never leave the device that connected; imported ids, review queue and settings sync, so dedupe holds across devices. If two devices import the same activity at once, the duplicate session (same `externalId`) is dropped after the merge |
| When | On opening, 3s after any change, on coming back into view (if 30s+ since the last), on going back online, and every 5 min while visible. One tab at a time via Web Locks. Status and errors in Settings › Sync across devices |
| Backups | Still offered. A restore while signed in replaces the account's copy too (said in the confirm), since the restored data is newer than the base |
| Not yet | Realtime push from the server (changes arrive on the next sync instead), deleting the account's data from inside the app (delete the rows or the user in Supabase) |

## Welcome screen and your name (25 Nov 2026)

| Topic | Decision |
|---|---|
| Why | Sign-in lived at the bottom of Settings, and the Home greeting had a name typed into the code. Signing in should be the first thing you see, and the app should know who you are on every device |
| Name | `name` in `tt-settings` (up to 40 characters), so sync and backups carry it with no extra wiring. Set when making an account ("What should we call you?") or in Settings › Display › Your name. Home reads "Good morning, Ollie."; with no name it reads "Good morning." with a "What should we call you?" link |
| Welcome screen | Covers the whole app whenever sync is set up and nobody is signed in (`src/welcome/Welcome.tsx`, shown from `AppShell`). A greeting for the time of day, your name if this device knows it ("Welcome back"), the date, sessions logged here and days to the next race, beside the sign-in / create-account form. Without sync set up (no Supabase keys) it never appears |
| New device | A device that has never seen you says "Good morning." and, once you sign in, the first sync brings your name (and everything else) down before the app opens, so Home greets you by name straight away |
| Skipping | "Use without signing in" lets the app open for that browser tab's session (`sessionStorage`), so a reload doesn't nag but a new tab or app launch asks again. Signing out brings the screen straight back. The Strava return address (`/strava/callback`) is never covered |
| Always visible | Sidebar (laptop) and top bar (phone) show your initial, name and sync state while signed in, and a bold Sign in button, which reopens the screen, while not |
| Code | `src/welcome/` (greeting, tested; state; form shared with Settings › Sync) |

## AI coach: research-led plan builder (proposed 12 Nov 2026, not yet agreed)

| Topic | Proposal |
|---|---|
| First job | Build the whole plan. Later jobs (weekly review, chat, session feedback) reuse the same pieces |
| Screening | A short pre-plan questionnaire, filled from the app's data first so nothing is asked twice: goal race (date, format, distances, priority, target), training history (last 12 weeks of logs and Strava: hours/week per sport, longest sessions, recent PBs, load and form), days and times free (from shifts, events and Plan › Work), injuries and niggles (what, where, how long, what aggravates it, cleared by a physio or not), equipment and access (turbo, pool, gym, open water), experience in the event, and hard limits (most hours a week, days off). Saved as an athlete profile that later plans and reviews reuse |
| Division of labour | The coach doesn't schedule sessions itself. It decides what the existing planner can't: the block's shape (weeks, cycle, build and deload %, sport mix, sessions and key sessions per sport, easy lengths, most training days, doubles), race-specific sessions (bricks, race-pace run–bike–run, transition practice) written as library workouts or one-offs, and changes to the load heuristics. `src/plan/generate.ts` then places everything around work and events as it does now |
| Evidence | Two layers. (1) A curated library in the repo: each entry holds the claim, the numbers to use, the population it was tested on, the citation with its DOI, and an evidence grade (meta-analysis, RCT, observational, expert consensus). (2) Live search of papers for anything the library doesn't cover, shown as "found by search, not vetted". Every decision in a proposal names its source; anything without one is labelled the coach's judgement |
| First disciplines | Duathlon and triathlon (sprint to standard): run–bike–run and swim–bike–run structure, brick sessions, intensity distribution, taper, run-off-the-bike pacing. Rowing, running and strength follow as library entries are added |
| Injuries | The coach adapts around a niggle (less impact, cross-training, slower run build-up) but never diagnoses. A red-flag answer (sharp or worsening pain, pain at rest, not seen by anyone) shows "see a physio first" and leaves out the affected work until it's cleared |
| Output | A proposal, never a silent change: the block settings, sessions and heuristic changes, each with a one-line reason and its citation. Accept all, accept some, or ask for changes, then the planner runs. The proposal is kept with the block so the reasoning stays visible later |
| Engine | Claude through a server function, like the Strava token exchange, so the API key (`ANTHROPIC_API_KEY`) never reaches the browser. Structured output checked against the Block/Workout types before anything is shown. Plan-building runs long (research plus reasoning), so it needs a background or streaming function rather than Netlify's default short timeout; to be settled when building |
| Data sent | A summary the app computes (weekly totals, load, PBs, check-in averages, shift pattern, screening answers), not the raw log. Said plainly in Settings before first use |
| Cost | Pay-as-you-go Anthropic API key, separate from any Claude subscription. Estimated well under £1 per plan built, to be measured |

## Coach screening decisions (11a, 12 Nov 2026)

| Topic | Decision |
|---|---|
| Where | Plan › Coach screening (`/plan/coach`), with a Coach card on Plan showing progress and anything flagged |
| Storage | `profile` inside `tt-plan-v1`, so sync and backups carry it with no extra wiring. Injuries are a list keyed by `id`, so one added on each device both survive a merge. `src/coach/profile.ts` keeps saved shapes safe |
| Sections | Goal race (a race from Races & events, format presets that fill the leg distances, aim, target time, experience) · Health check (the PAR-Q+ style questions plus recent illness) · Injuries & niggles · Training history · Time to train (incl. other sport to keep up, e.g. rowing twice a week) · Kit & facilities. Each says what's still missing; the coach needs all six done |
| From the data | Training history is worked out, not asked: the last 12 whole weeks of the log (hours, days, per-sport sessions, distance and longest, multisport count, fitness/fatigue/form, check-in averages, niggle tags and injury notes). The work pattern comes from the next 4 weeks of shifts, or the last 4 if none are added. Logic `src/coach/history.ts` |
| Flags | Any health yes → see a GP before intensity. An injury with pain at rest, at night, getting worse, other symptoms or training pain above 5/10 (after the pain-monitoring model, Silbernagel et al. 2007), or painful and not looked at, → see a physio first, and what sets it off is kept out of plans until cleared. Otherwise the coach plans around it. Logic `src/coach/screening.ts` |
| Not yet | Nothing is sent anywhere: the coach that reads the profile is 11c |

## Research library decisions (11b, 24 Nov 2026)

| Topic | Decision |
|---|---|
| Where | `src/coach/evidence/`: `sources.ts` (the studies), `findings.ts` (what the coach may plan from), `index.ts` (look-ups and relevance). Browsable on Plan › Coach › Research (`/plan/coach/research`), "For you" or all |
| Sources | 35 papers, each found in the paper index (PubMed/PMC) and its authors, year, journal, DOI and PubMed id checked, with the finding restated from its abstract (publisher or PubMed page). Volume/pages only where seen. Nothing added from memory alone |
| Findings | 17, each with a plain summary, guidance with numbers, caveats, an evidence strength and which part of the plan it shapes. Where a number is coaching convention rather than a study result (sets and reps, brick length, the 10% run rule), the caveat says so. Counter-evidence is kept in (e.g. threshold training matching polarised in recreational runners; block periodisation's conflicting trials) |
| Topics | Intensity mix, long intervals, taper, bricks, bike pacing, cadence, first km off the bike, duathlon pacing, heavy strength, lifting order, run progression, the acute:chronic ratio (information only), pain monitoring, sleep, HRV-guided days, block periodisation, planning around work |
| Strength rules (tested) | Strong needs a meta-analysis or systematic review among its sources; moderate needs a trial or review; every source is cited and every citation exists |
| Relevance | From the screening: duathlon or triathlon, running, an injury, lifting or gym access, HRV in recent check-ins, work shifts, an A race. Each relevant finding says why it applies |
| Gaps | Swimming technique and open-water skills, heat, nutrition, rowing, running and strength as main goals: to be added, or answered by live paper search in 11c (marked not vetted) |

## Rule-based coach decisions (11d, 24 Nov 2026)

| Topic | Decision |
|---|---|
| Why | 11c (Claude) parked to avoid API costs. The same job done by fixed, tested rules: `src/coach/rules.ts` turns the profile, the goal race, training history and work pattern into a block for the existing planner, which still places every session around shifts and events |
| Where | Plan › Coach › Build my plan (`/plan/coach/plan`), from the screening once it's saved and complete, or the Coach card on Plan. Shows the block (weeks, volume, sessions per sport), the bricks it adds, and every choice with its research findings (linked to Research) or marked "Coach's judgement". Nothing is saved until "Create this block"; an overlapping block can be replaced (logged sessions stay) |
| Length | From next week to the race week, plus a recovery week for an A race. Over 20 weeks away: a 12-week base block, with a note to run the coach again later. Under 3 weeks: a warning |
| Rhythm | 3:1, or 2:1 when newer to training (under 2 years), carrying a niggle, or recently ill (judgement). Build weeks +8% (+5% in those cases or with no running logged); deloads at 60% |
| Volume | Starts from recent training (×1.05), never cutting the race sports below what's already done to fit new strength or kept sessions; 60% of the limit with nothing logged. Grows each cycle (new `cycleGrowthPct` block setting, up to 10%, 5% with a niggle, illness or under 2 years) as far as the biggest real week stays inside the hours limit |
| Sports | Duathlon run 40 / bike 60; triathlon swim 20 / bike 50 / run 30. Running first keeps its current time (up to half the week) and other sports share the rest, so extra volume lands on the bike. Sports blocked by an injury flagged "see a physio" are left out (cross-training instead). Kept sports (e.g. rowing) all easy. Strength twice a week with gym access (once under 4h a week), one heavy |
| Sessions | Counts suit a mid-block week, with easy sessions no shorter than run 25′, bike 40′, swim 25′ there; lengths are set for week 1 and grow with volume. A long session only when it's at least 45′ run / 60′ bike from week 1 and fits a day off |
| Hard sessions | 2 a week across all sports under 6h, otherwise 3, ordered bike (brick), run, then run (duathlon) or swim (triathlon); none after a health "yes"; no running speed work with a hills/speed-aggravated niggle |
| Bricks | Three library workouts (tagged `brick`, `coach`), set as the block's benchmarks so the hard bike session of build weeks 1–3 is a brick, repeated each cycle: 45′ bike + 10′ run; 3 × (10′ bike + 5′ run); a race simulation sized from the goal legs. Re-running reuses them rather than adding copies |
| Taper | Sprint/super sprint or a race under 3 weeks away: the planner's one-week taper. Longer A races: two weeks (the extra week set as a taper by hand). B races: a lighter race week |
| Stored | The decisions and warnings are kept on the block (`coach`) and shown on Plan as "Why this plan" |
| Planner change | `useReplan` takes new workouts directly, so a block can be planned with bricks saved in the same moment |
| Not yet | Automatic HRV-based swaps (stated as a by-hand rule); a long session that switches on later in the block; per-sport progression |

## Fitness markers and zones decisions (12, 24 Nov 2026)

| Topic | Decision |
|---|---|
| Why | Planned sessions only said "zone 4" or an RPE. With a threshold number per sport, every session aimed at a zone shows the pace or watts to hold, and the numbers' trend is the plainest sign the training is working |
| Markers | Run threshold pace · bike FTP · erg 2k · swim CSS · max HR · resting HR. Base units as elsewhere: paces in s/km (shown /km, /500m, /100m), FTP in watts, 2k as total seconds |
| Where | Log › Your numbers › Fitness markers (`/log/markers`): current value per marker with its trend, change since the last result and re-test status; add a result; suggestions from the log; your zones in real numbers; full history with delete |
| Storage | `markers` list in `tt-log-v1`, one record per result (`id`, `kind`, `value`, `date`, `source`: test, race, estimate or entered, and the session it came from). Latest by date is current. Keyed by `id`, so sync and backups carry it unchanged |
| From the log (`src/markers/estimate.ts`) | Always confirmed before saving, from Fitness markers or a "New fitness marker?" card on the session itself. Run: a session typed Test of 25–35′ gives its average pace (Friel's 30′ test uses the whole 30′; the last-20′ rule is for heart rate); a race or other effort from 3k to a half goes through Daniels' VDOT equations to the pace held for 60′ (a 46:00 10k gives 4:40/km, tested). Bike: a Test with a 20′ rep or 20′ session gives 95% of its average watts (Allen & Coggan; validity studied by Borszcz et al. 2018); about an hour at race or test effort gives its average. Erg: a single 2,000m test or race. Swim: a Test with a 400 and a 200 gives CSS = (t400 − t200) ÷ 2 per 100m (critical velocity, Wakayoshi et al. 1992, from two swims). Max HR: a session's max above the current one (under 230, to skip strap spikes). Only from the last 12 weeks, newer than the current marker, not already saved. "Test" is now a session type for run, bike and swim |
| Max HR | A new current max HR marker sets Settings' max HR, and resets the HR zones if they were still the defaults from the old max |
| Zones (`src/markers/zones.ts`) | Five per sport, so "zone n" means one thing everywhere. Run: Friel pace zones as % of threshold pace (time): Z1 slower than 129%, Z2 114–129, Z3 106–113, Z4 99–105, Z5 faster than 99% (5a–c folded). Bike: Coggan levels as % FTP: up to 55, 56–75, 76–90, 91–105, 106+ (levels 5–7 folded). Erg: seconds added to the 2k split /500m: Z1 +31 or slower, UT2 +20–30, UT1 +12–18, AT +5–10, TR/AN +2 or faster. Swim: % of CSS speed 77–87, 87–94, 95–98, 99–104, 105+. All coaching convention from the named sources (TrainingPeaks for Friel and Coggan, ErgManiac, UltraSwim 33.3), not trial results; editable in Settings › Pace and power zones, with Reset. Derived paces round to whole seconds of the unit shown |
| Targets | A rep or session aimed at `hrZone` n also shows the pace or power of zone n once its sport has a marker; existing library workouts and the planner's one-offs gain numbers without rewriting. A new target type, "vs marker" (`rel` on an aim): % FTP on the bike, seconds either side of threshold (run, /km), the 2k split (erg, /500m) or CSS (swim, /100m). Logging from a planned session or library workout writes the numbers into the session's targets, so it's graded against what was asked at the time. One-sided pace targets now read "or slower" when they're a lower bound |
| Out of date | Targets from a marker over 8 weeks old show "(old marker: re-test)". No marker: HR zone and RPE as before |
| Re-testing | A marker is due a re-test after 6 weeks (Settings: 4, 6, 8 or 12). The planner's existing deload-week test now uses a built-in test when the library has none (30′ run test, 20′ FTP test, 2k, 400 + 200 CSS swim, each with how-to notes), prefers the last day of the week, and takes the block's new `testSports` in turn, one per deload (else the main sport, as before). A block with no hard sessions keeps the old steady session there, so nobody flagged by the health check gets an all-out test. The rule-based coach sets `testSports` to its race sports with hard work (run, then bike, then swim) and says so under "Testing" |
| Seeing it | Analysis › Fitness markers: each sport's marker over time (tests filled, estimates hollow), with the change since the current block began. Home: current markers, any due a re-test, and new results in the log; a nudge to add them when there are none. Log home counts the ones due |
| Tests | `src/markers/markers.test.ts`: zone and relative targets per sport, resolution order, logging writes targets in, each estimate (incl. the VDOT check), suggestion filtering, staleness and re-test timing, and the planner's built-in, rotating and skipped tests |
| Not yet | Separate HR zones per sport from lactate-threshold HR; Strava best efforts as estimates (activities that come in as sessions typed Race or Test are already read); race-time predictions from markers |

## Weekly review and adapting the plan decisions (13, 24 Nov 2026)

| Topic | Decision |
|---|---|
| Why | The plan was built once and then carried on whatever happened. The review compares the week with the plan and the check-ins and proposes changes for the weeks ahead, the way the coach does: never silently |
| When | "Review your week" on Home and Plan for last week, or this week from 5pm on its last day (week-start setting), until reviewed or skipped; only weeks with planned sessions. Any past week from Plan (a line under the week: "Review this week", or what the review said). Page: `/plan/review/:week`. If Strava is connected and has activities waiting, or hasn't synced since the week ended, it says so first |
| What it shows | Each planned session as done, moved (logged another day), skipped or missed, with reps on target for key sessions; time done against planned; key sessions; load; check-ins against the athlete's own last 4 weeks (or fixed cut-offs with fewer than 7 check-ins); ill days; injury notes; easy sessions that felt hard; fitness, fatigue, form, and the acute:chronic ratio as information only (`no-acwr-rules`) |
| What it asks | How the week felt (1–5); any niggle new or worse, in the screening's own injury editor (so the same flags apply) plus "settled by the next morning?", saved to the coach profile; anything coming up (away or busy, saved to Races & events); a note |
| "Worse than usual" | A check-in more than one SD worse than the athlete's last 4 weeks (at least ¾h of sleep or a point on a scale) on sleep, sleep quality, energy, tiredness or soreness. Fixed cut-offs without 7+ check-ins: under 6h sleep, quality or energy 2 or less, tiredness or soreness 4+ |
| Rules (`src/review/rules.ts`) | Each proposal has a reason and its findings or "Coach's judgement". Advice-only ones link where to act |
| · Ill | Illness ticked in a check-in: next week easy only (judgement) |
| · Niggle | Follows the screening's flags (pain above 5/10 in training, getting worse, at rest or at night, other symptoms, or painful and not looked at): the sports it sets off are left out next week, "see a physio first", and every week after until cleared. Otherwise pain not settled by the next morning: less of those sports next week (`pain-monitoring`) |
| · Struggling | 3+ check-ins worse than usual and an easy session 2+ RPE above plan, or 5+ such check-ins: bring the deload forward a week when one is still to come, else cut next week 20%, else (next week already lighter) advice only (judgement, `sleep`) |
| · Low completion | Under 60% of planned time, or half the key sessions missed: next week holds this week's volume. Two weeks running: re-run the coach (judgement, `run-progression`) |
| · Missed key | A missed benchmark moves into the same sport's next build-week key session after today, skipping a week another proposal makes easy; other missed key sessions aren't made up (judgement) |
| · Targets | Most key reps faster than target at a lower RPE than planned: re-test, not more volume. Two key sessions in a row mostly short of target: re-test or an easier week. Both link to Fitness markers |
| · Work | Next week's shifts 25%+ above the last 4 weeks and at least 30h: next week 90% (`plan-around-work`); over 45h the planner already drops easy sessions, so advice only |
| | Ill and struggling don't stack with low completion or work cuts on the same week. A good week proposes nothing |
| Morning check | On Home after the day's check-in, if a hard session is planned and not done: under 6h sleep, sleep quality 1–2, or HRV below normal. HRV as in the HRV-guided trials (Javaloyes et al., tabled in Manresa-Rocamora et al. 2021): the 7-day average against the 28 days before, mean ± 0.5 SD; needs 3+ readings this week and 14+ before. "Swap it" turns today into an easy session in the same sport and moves the hard one to the first later day this week with no hard session that day or either side, none in the same sport, and no race that day or the next (or drops it if none fits); "Keep it". Asked once a day (`dayChecks`, keyed by date) |
| Applying (`src/review/apply.ts`) | Accept all or untick some. Volume, easy-only, less and left-out sports go in `weekAdjust` on the block (per week start; changes to one week combine: the smaller volume and every restriction), deload-forward in `weekKinds`, moved sessions edit the planned session (locked). Then the block re-plans from today. Weeks show "After your review: …" in their notes. Saving a review again applies its answers on top |
| Stored | `reviews` and `dayChecks` in `tt-plan-v1`: answers, a snapshot of the numbers, the proposals and which were accepted |
| Tests | `src/review/review.test.ts`: outcomes, own-normal and fixed check-in cut-offs, each rule with a made-up week (including a good week proposing nothing), conflicts between rules, applying and combining changes, the planner honouring them, the morning check and HRV range, the swap, and when a review is due |
| Not yet | Push notifications; rules that learn their thresholds from the athlete's own history (the parked adaptive coaching) |

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

## Triathlon focus: sleep, weight, week view, starter library (25 Nov 2026)

| Topic | Decision |
|---|---|
| Focus | The app leans to triathlon, duathlon and multisport; rowing and CrossFit stay but are no longer the lead |
| Sleep | Typed as hours and minutes (`HoursMinutesInput`), still stored as decimal hours so existing check-ins, analysis and sync are untouched. Shown as "7h 30m" everywhere (`formatSleep`) |
| This week (Home) | Each day is a button; the picked day shows its work, race, planned sessions still to do and what was logged, with "Add session". Open plan goes to that week |
| Weight | `/log/weight`, from Log › Your numbers. Weigh-ins are the check-in's `weightKg` (one per day, same record as the daily check-in), so nothing new to sync. The 7-day trailing average is the headline (`src/analysis/weight.ts`), single weigh-ins are dots behind it; change over 4 and 12 weeks; optional goal weight (`targetWeightKg` in settings) drawn as a dashed line; ranges 4 wk to all |
| Starter sessions | See Session library decisions above. Targets are relative (% FTP, offsets against threshold pace or CSS, HR zones), so they resolve from each user's markers |
| Not done | Open-water swim sets; a weight goal date; planning a brick into a training block (see Bricks below) |

## Bricks in the library (25 Nov 2026)

| Topic | Decision |
|---|---|
| Model | A library workout can carry `legs` (each a single-sport mini-workout: duration or distance, whole-leg target, reps, notes) and a `brickKind` (brick, duathlon, triathlon, aquathlon, other). Its `sport` is just the first leg's, so old code keeps working; `isBrick()` (`src/library/workouts.ts`) is the test |
| Making one | Library › New workout › "Brick / multisport": pick the kind (it fills the usual legs while nothing is entered), then edit each leg with the same target and rep editors as a single workout. Or Save to library from a logged multisport event, which copies each leg's structure and targets, not its results. Transitions are never part of a brick: they come from start and finish times when it is logged |
| Logging | "Log this workout" goes to `/log/multi/new?workout=id`: the event (kind, name) and one session per leg are pre-filled like a single workout, with zones and relative targets turned into numbers from the current markers. The event keeps `workoutId`; the legs don't, so a brick's history counts events. `/log/new?workout=id` for a brick redirects there. Deleting the brick unlinks its events |
| Library | Bricks have their own icon and a Brick filter, and are kept out of the single-sport filters |
| Planning | Not yet. The planner's pools and the swap-a-workout pickers skip bricks, since a planned session is one sport with one duration. Planning a brick as one session is the natural next step |
| Starter set | Three bricks added (Yee's big brick, a bike–run brick, a sprint duathlon rehearsal). People who already added the starter set are offered new starters in a quiet row on the Library page, with Add and Hide; Hide is remembered on that device |
| Fix | The workout form dropped relative targets (% FTP, vs threshold or CSS) whenever a target was edited; they are now kept |
