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
2. **Session logging** — fast entry per sport, sport-specific fields, RPE/notes
   - 2a ✅ data model, per-sport fields, interval breakdown and session card (example data)
   - 2b logging form + storage
3. **Session library** — reusable workouts/templates, log-from-template
4. **Programme planner** — blocks → weeks → sessions, target races, schedule
5. **Analysis** — training load, PBs, planned vs completed, per-sport trends
6. **Strava import** — OAuth + activity sync, dedupe against manual logs
7. **Link to existing project** — scope decided at that point

## Conventions

- All colours come from tokens in `src/index.css` (`bg-surface`, `text-muted`, `bg-accent`, `text-sport-row`, …). Each discipline has its own colour token for logs, plans and charts.
- Shared UI pieces live in `src/components/ui.tsx`; nav items in `src/layout/nav.ts`.
- Settings are in `src/settings/SettingsContext.tsx` (localStorage until Supabase arrives).

## Session fields (agreed 23 Oct 2026)

Model: `src/sessions/types.ts`. Which stats show where: `src/sessions/fields.ts`.

**Every session:** date/time, title, sport, intent (easy, steady, long, tempo, threshold, intervals, race, technique, strength, recovery), time, distance, avg/max HR, RPE (1–10), notes, source (manual/Strava). Session load = RPE × minutes (sRPE, AU).

| Sport | Overview (card) | Extra detail |
|---|---|---|
| Rowing | distance (m), time, avg split /500m, power (erg) or rate (water) | erg/water + boat, avg rate, power, drag factor |
| Running | distance, time, avg pace, avg HR | cadence, elevation, surface |
| Cycling | distance, time, avg power (or speed), avg HR | speed, NP, cadence, elevation, indoor/outdoor |
| Strength | time, exercises, sets, WOD result | exercises with sets × reps × weight, volume, WOD format/description/cap |
| Recovery | time | activity (mobility, yoga, stretching, massage, sauna, walk) |

**Intervals.** Structured sessions (tempo, threshold, intervals, race) carry a list of work reps:
time, distance, rest, avg power, avg/max HR, rate/cadence, and an optional target on one metric
(power, pace, split, HR or rate) as a range or one-sided bound. Each rep is marked *on target*,
*harder than target* (amber) or *missed* (red, shading from light to deep the further off it is — full red at 2% off for splits, 3% pace, 5% power/HR, 7% rate). Easy/steady sessions have no reps and just show the whole-session numbers.

**Views.** Session card = overview: headline stats, and for structured sessions a rep strip (one chip per
rep, coloured by target) with "x/y on target". For structured sessions the headline split/pace/power is the
average across work reps, not the whole session. One tap expands the card: full interval table (every rep,
work-rep averages, target, first→last rep drift), strength detail, all session stats, notes.

Reps can also carry a target **HR zone** (1–5). Zones are set in Settings (max HR, editable zone tops,
default 60/70/80/90% of max). Each rep chip has an HR bar on a 50%–max scale with the target zone shaded,
coloured the same way, so HR creep across reps is visible.

Strava import (section 6) should map Strava laps onto reps.

## Morning check-in

One per day on Home: sleep duration, sleep score, resting HR, HRV (mirroring Garmin's morning report),
plus soreness (1 none – 5 very sore) and energy (1 drained – 5 great) and a note. Manual for now,
stored in localStorage. Garmin has no personal-use API (the Connect Developer Program is for approved
businesses), so automatic sleep import is an open question — see options discussed 23 Oct 2026.

## Parked for later (noted 23 Oct 2026)

- **Garmin import** for the morning check-in. Too much faff for now (no personal-use API); revisit later.
- **Adaptive coaching.** The miss thresholds above (`FULL_MISS` in `src/sessions/intervals.ts`) are a
  flat starting point. A later coaching/training feature should learn from logged sessions and
  check-ins, spot weaknesses, and adjust how strictly reps are judged: harsher when there's room to
  push, more forgiving when the athlete is struggling (poor sleep, high soreness, low energy, fading
  across a block). Thresholds should become per-athlete and per-context rather than fixed rules.
