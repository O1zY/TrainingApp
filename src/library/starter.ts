import type { ExerciseTemplate, PieceTemplate, Sport, Workout } from '../log/types'

// A starter set of triathlon / duathlon sessions, offered from the Library page.
//
// Where each one comes from is written in its `source`. Three kinds:
// - Published sessions, taken as the page reports them (Brownlee, Yee, the Norwegian block).
//   Where the original is elite-sized the description says how to scale it; the structure is kept.
// - Standard field tests (FTP, 30-min run, CSS) that the fitness markers are measured with.
// - Basic sessions (easy swim, bike, run, strength, mobility) that fill the rest of a week.
//
// Targets are relative to the athlete's fitness markers (% of FTP, seconds against threshold pace or
// CSS) or an HR zone, so they turn into real numbers once the markers are set, whoever is using them.
// Ids are fixed so adding the set twice, or on a second device, never makes duplicates.
// Pages read 25 Nov 2026.

type Piece = Omit<PieceTemplate, 'id'>

const SRC = {
  brownleeKey: '220 Triathlon, “Alistair Brownlee’s key triathlon training sessions”: https://www.220triathlon.com/training/alistair-brownlee-s-key-triathlon-training-sessions/',
  brownleeWeek: '220 Triathlon, “Alistair & Jonny Brownlee’s top speed tips for Olympic-distance triathlon” (2019): https://www.220triathlon.com/training/alistair-jonny-brownlees-top-speed-tips-for-olympic-distance-triathlon/',
  brownleeTri247: 'Tri247, “How the Brownlees train for success”: https://www.tri247.com/triathlon-news/elite/brownlees-train-success',
  yee: 'Coach Ray (Qwik Kiwi Coaching), “Alex Yee’s BIG Brick Session”, from his Strava ride and run of 15 Jul 2024: https://www.coachray.nz/2025/10/06/mondays-brick-alex-yees-big-brick-session-paris-olympics-training/',
  norway: 'Triathlete, “How to Train Like A Norwegian (Without The Blood)” (Zach Nehr, 2023): the “Norwegian Method Lite” block, after the training of Blummenfelt and Iden under Olav Aleksander Bu: https://www.triathlete.com/training/how-to-train-like-a-norwegian-without-the-blood/',
}

const BASIC = 'Basic session. Easy work is most of a week: about 90% of the training of Olympic and world champion endurance athletes was low intensity (Tønnessen et al. 2014, cross-country skiers and biathletes; see Plan › Coach › Research).'

/** n identical reps. */
const reps = (n: number, p: Piece): Piece[] => Array.from({ length: n }, () => ({ ...p }))

interface Def {
  slug: string
  name: string
  sport: Sport
  type: string
  description: string
  source: string
  tags: string[]
  rpe: number
  hrZone?: number
  durationSec?: number
  distanceM?: number
  pieces?: Piece[]
  exercises?: Omit<ExerciseTemplate, 'id'>[]
}

const min = (m: number) => m * 60

const DEFS: Def[] = [
  // ---- Swim ------------------------------------------------------------------------------
  {
    slug: 'swim-css-test',
    name: 'CSS test: 400m + 200m',
    sport: 'swim',
    type: 'test',
    rpe: 9,
    tags: ['test'],
    description:
      'Sets your critical swim speed (CSS), the pace the swim zones are built from. Warm up 600–800m with a few 50m pick-ups. Swim the 400m flat out and note the time, recover fully (about 5′ easy), then swim the 200m flat out.\n\nCSS in seconds per 100m = (time for 400m − time for 200m) ÷ 2. Save it in Log › Fitness markers.',
    source: 'Standard field test: critical swim speed from two time trials, after Wakayoshi et al. (1992), Eur J Appl Physiol.',
    pieces: [
      { distanceM: 400, restSec: min(5), notes: 'All out, even pace' },
      { distanceM: 200, notes: 'All out' },
    ],
  },
  {
    slug: 'swim-brownlee-15x100',
    name: 'Brownlee 15 × 100 on a falling send-off',
    sport: 'swim',
    type: 'intervals',
    rpe: 7,
    tags: ['brownlee'],
    description:
      'Alistair Brownlee’s main swim set: 5 rounds of three 100s, each round sent off at 1:20, 1:15 and 1:10, so the rest shrinks and the pace rises within every round. “You want that one off 1:10 to be slightly above race pace”: the send-off of the last 100 in a round is your race pace.\n\nWarm up 800m (200 free, 200 back, 200 drill, 200 free) and 6 × 75m hand drills; warm down 400m easy. His send-offs are for a fast swimmer: slow them to suit, using your fastest 100 as the base (a 24-minute 1500 is 1:36 per 100, so send-offs of about 1:50, 1:45 and 1:40). New to it, start with 9 × 100m.\n\nThe targets are against your CSS: first 100 aerobic, second at CSS, third a touch faster.',
    source: SRC.brownleeKey,
    pieces: Array.from({ length: 5 }, () => [
      { distanceM: 100, restSec: 15, rel: { lo: 4, hi: 8 }, notes: 'Off 1:20, aerobic' },
      { distanceM: 100, restSec: 15, rel: { lo: -1, hi: 2 }, notes: 'Off 1:15, about CSS' },
      { distanceM: 100, restSec: 15, rel: { hi: -2 }, notes: 'Off 1:10, a touch above race pace' },
    ]).flat(),
  },
  {
    slug: 'swim-10x100-css',
    name: '10 × 100 at CSS',
    sport: 'swim',
    type: 'intervals',
    rpe: 6,
    tags: ['threshold'],
    description: 'Steady threshold swimming: ten 100s at CSS on 15″ rest. Hold the same time on every rep; if the last ones slip by more than 2″, the first ones were too fast. Warm up 400–600m, warm down 200m.',
    source: 'Standard CSS set (pace from the CSS test above).',
    pieces: reps(10, { distanceM: 100, restSec: 15, rel: { lo: -1, hi: 2 } }),
  },
  {
    slug: 'swim-easy-45',
    name: 'Easy swim, 45′',
    sport: 'swim',
    type: 'pool',
    rpe: 3,
    tags: ['easy', 'norwegian'],
    description: 'Continuous easy swimming with a few drill lengths. Below your first threshold: you could talk between lengths. The Norwegian block has two of these a week.',
    source: SRC.norway,
    durationSec: min(45),
    hrZone: 2,
  },

  // ---- Bike ------------------------------------------------------------------------------
  {
    slug: 'bike-ftp-20',
    name: 'FTP test: 20 minutes',
    sport: 'bike',
    type: 'test',
    rpe: 10,
    tags: ['test'],
    description:
      'Sets your FTP, which the bike zones are built from. Warm up 20′ easy with three 1′ efforts, ride 5′ all out to clear the legs, then 10′ easy. Then 20′ at the hardest even pace you can hold from start to finish, ideally on a trainer or a flat road.\n\nFTP = 95% of your average power for the 20′. Save it in Log › Fitness markers.',
    source: 'Standard 20-minute FTP protocol (Allen & Coggan, Training and Racing with a Power Meter).',
    pieces: [
      { durationSec: min(5), restSec: min(10), notes: 'All out, to clear the legs' },
      { durationSec: min(20), notes: 'Hardest even effort you can hold. FTP = 95% of the average' },
    ],
  },
  {
    slug: 'bike-brownlee-3x30',
    name: 'Brownlee 3 × 30′ at race pace',
    sport: 'bike',
    type: 'tempo',
    rpe: 6,
    tags: ['brownlee'],
    description:
      'Alistair’s solo session for non-drafting racing: three 30′ blocks at race pace with 5′ rest between. For 70.3 that is a Zone 3 tempo effort; the short rests are mostly a mental break, and the point is pacing. Ride to a 3–5-second power average, not the instant number, or mid-zone on heart rate to avoid surges.',
    source: SRC.brownleeKey + ' (coach Nik Cook).',
    pieces: reps(3, { durationSec: min(30), restSec: min(5), rel: { lo: 80, hi: 90 } }),
  },
  {
    slug: 'bike-chain-gang',
    name: 'Group ride: through and off, 40 km',
    sport: 'bike',
    type: 'intervals',
    rpe: 7,
    tags: ['brownlee', 'race-sim'],
    description:
      'Alistair Brownlee’s go-to bike session that fits inside an hour: a fast group ride of about 40 km, taking turns on the front like draft-legal racing. Roughly 50′ at hard race pace; “through and off” for the first 20′, then the strongest stay forward. Smooth, controlled turns matter more than big pulls. Winter version: four riders, slightly longer turns.',
    source: SRC.brownleeKey + ' (coach Mark Buckingham).',
    durationSec: min(60),
    distanceM: 40000,
    hrZone: 4,
  },
  {
    slug: 'bike-norway-4x10',
    name: 'Norwegian threshold: 4 × 10′',
    sport: 'bike',
    type: 'intervals',
    rpe: 6,
    tags: ['norwegian', 'threshold'],
    description:
      'Medium threshold, between your two lactate thresholds: 80–85% of FTP, about 80–84% of max HR, RPE 4–5. Controlled, not hard; hold the number, don’t chase it, and stay off the sprints on corners and descents. The Norwegians ride these indoors for exactly that reason. The point is to repeat them, so finish able to do it again.',
    source: SRC.norway + ' Week 1 Thursday.',
    pieces: reps(4, { durationSec: min(10), restSec: min(5), rel: { lo: 80, hi: 85 } }),
  },
  {
    slug: 'bike-norway-3x15',
    name: 'Norwegian threshold: 3 × 15′',
    sport: 'bike',
    type: 'intervals',
    rpe: 6,
    tags: ['norwegian', 'threshold'],
    description: 'The longer version of the 4 × 10′: medium threshold, 80–85% of FTP, RPE 4–5, with 10′ easy between. Week 2 of the block.',
    source: SRC.norway + ' Week 2 Thursday.',
    pieces: reps(3, { durationSec: min(15), restSec: min(10), rel: { lo: 80, hi: 85 } }),
  },
  {
    slug: 'bike-norway-20x30',
    name: 'Norwegian hard threshold: 20 × 30″',
    sport: 'bike',
    type: 'intervals',
    rpe: 6,
    tags: ['norwegian', 'threshold'],
    description: 'The evening half of a double-threshold day: hard threshold, 86–90% of FTP, RPE 5–6, 30″ on and 30″ easy. Even and repeatable; it should not feel like a sprint session. Warm up 15′.',
    source: SRC.norway + ' Week 2 Thursday, evening.',
    pieces: reps(20, { durationSec: 30, restSec: 30, rel: { lo: 86, hi: 90 } }),
  },
  {
    slug: 'bike-yee-brick-bike',
    name: 'Yee brick: the bike',
    sport: 'bike',
    type: 'intervals',
    rpe: 8,
    tags: ['yee', 'brick', 'race-sim'],
    description:
      'The ride half of Alex Yee’s big brick, done in the build to the Paris Olympics (91 km, 2 h 24 on Strava). Draft-legal racing has sprints to get into bunches, solid efforts to close gaps and stretches of cruising; this has all three.\n\nFull session: 60′ warm-up, then the pieces below in order, with 15′ very easy after the 3′ tempo effort and a cool-down of about 26′ to finish; then run straight off (Run › Yee brick run). The rep structure is his; the watts are set against your FTP, and the long blocks scale with your event, so cut the 90′ to 45′ for a sprint-distance build.\n\nIntensity levels are the writer’s own (Coggan-style): L4 about 91–105% of FTP, L5 106–120%, L3 76–90%.',
    source: SRC.yee,
    pieces: [
      { durationSec: 60, restSec: 60, rel: { lo: 91, hi: 98 }, notes: 'L4−' },
      { durationSec: 60, restSec: 60, rel: { lo: 100, hi: 105 }, notes: 'L4+' },
      { durationSec: 60, restSec: 90, rel: { lo: 106, hi: 120 }, notes: 'L5' },
      ...[90, 90, 90, 60].map((rest): Piece => ({ durationSec: 10, restSec: rest, rel: { lo: 150 }, notes: 'Sprint' })),
      { durationSec: min(3), restSec: min(15), rel: { lo: 90, hi: 100 }, notes: 'L3+, then 15′ very easy' },
      { durationSec: min(3.5), rel: { lo: 106, hi: 120 }, notes: 'L5, a solid closing effort' },
      { durationSec: min(90), rel: { lo: 76, hi: 90 }, notes: 'L3, cruising in the bunch' },
    ],
  },
  {
    slug: 'bike-easy-90',
    name: 'Easy ride, 90′',
    sport: 'bike',
    type: 'endurance',
    rpe: 3,
    tags: ['easy', 'norwegian'],
    description: 'Relaxed riding in the endurance zone, below the first threshold. Stay seated on the hills, keep it conversational.',
    source: SRC.norway,
    durationSec: min(90),
    hrZone: 2,
  },
  {
    slug: 'bike-long-3h',
    name: 'Long steady ride, 3 h',
    sport: 'bike',
    type: 'endurance',
    rpe: 4,
    tags: ['easy', 'long'],
    description: 'The long aerobic ride of the week, steady, with food and drink on the bike. The Norwegian block builds it from 3 h to 4 h over three weeks; the Brownlees’ long aerobic Wednesday has a four-hour ride in it, between a swim and two runs, all at steady aerobic effort.',
    source: SRC.norway + ' Sundays; ' + SRC.brownleeTri247,
    durationSec: min(180),
    hrZone: 2,
  },

  // ---- Run -------------------------------------------------------------------------------
  {
    slug: 'run-30min-test',
    name: 'Threshold test: 30′ run',
    sport: 'run',
    type: 'test',
    rpe: 9,
    tags: ['test'],
    description:
      'Sets your run threshold pace, which the run zones are built from. Warm up 15–20′ with a few strides. Run 30′ as hard as you can hold evenly, ideally on a flat road or track, and press lap at 10′: your average heart rate for the last 20′ is your threshold heart rate, and your average pace for the whole 30′ is your threshold pace. Save it in Log › Fitness markers.',
    source: 'Standard field test: Joe Friel’s 30-minute threshold test (TrainingPeaks).',
    pieces: [{ durationSec: min(30), notes: 'Hardest even effort. Lap at 10′' }],
  },
  {
    slug: 'run-brownlee-10x400',
    name: 'Brownlee track: 10 × 400m',
    sport: 'run',
    type: 'intervals',
    rpe: 8,
    tags: ['brownlee'],
    description:
      'Alistair’s bread-and-butter track session: ten 400s with 1′ rest, which builds leg turnover and speed. His reps are 62–65 seconds, depending on the time of year; yours are at or just under your race pace. “I never run more than 5km on the track.” Warm up with 15–20′ building, then 600m of strides; cool down 10–15′.\n\nAdjust it: for 8 or 6 reps, wait for your heart rate to settle instead of watching the clock. For long-course racing, do more reps slower with a 200m jog recovery. Jonny runs a track session like this on Tuesdays, an interval session on Saturdays and a long run on Sundays.',
    source: SRC.brownleeKey + ' (coach Spencer Smith); weekly pattern from ' + SRC.brownleeWeek,
    pieces: reps(10, { distanceM: 400, restSec: 60, rel: { lo: -20, hi: -8 } }),
  },
  {
    slug: 'run-yee-brick-run',
    name: 'Yee brick run: 2 km + 1 km',
    sport: 'run',
    type: 'intervals',
    rpe: 8,
    tags: ['yee', 'brick', 'race-sim'],
    description:
      'The run Alex Yee went straight into off his big brick ride: 2 km at threshold, with a dead 180° turn in it to practise the tight turns of World Series courses, then 1 km faster, then a 10′ cool-down. Start it within a couple of minutes of racking the bike. Do it after a hard ride (Bike › Yee brick: the bike), or as a short brick after any ride.',
    source: SRC.yee,
    pieces: [
      { distanceM: 2000, rel: { lo: -3, hi: 3 }, notes: 'Threshold, with a 180° turn' },
      { distanceM: 1000, rel: { hi: -8 }, notes: 'Pick it up' },
    ],
  },
  {
    slug: 'run-norway-5x5',
    name: 'Norwegian threshold: 5 × 5′',
    sport: 'run',
    type: 'intervals',
    rpe: 6,
    tags: ['norwegian', 'threshold'],
    description:
      'The morning half of a double-threshold day: medium threshold, about 80–84% of max HR, RPE 4–5, with 1′ recovery. Controlled running: hold the heart rate rather than chasing pace. Warm up 15′.',
    source: SRC.norway + ' Week 1 Tuesday.',
    pieces: reps(5, { durationSec: min(5), restSec: 60, hrZone: 4 }),
  },
  {
    slug: 'run-norway-10x2',
    name: 'Norwegian hard threshold: 10 × 2′',
    sport: 'run',
    type: 'intervals',
    rpe: 6,
    tags: ['norwegian', 'threshold'],
    description: 'The evening half of the double-threshold day: hard threshold, 85–87% of max HR, RPE 5–6, with 1′ jog between.',
    source: SRC.norway + ' Week 1 Tuesday, evening.',
    pieces: reps(10, { durationSec: min(2), restSec: 60, hrZone: 4 }),
  },
  {
    slug: 'run-easy-40',
    name: 'Easy run, 40′',
    sport: 'run',
    type: 'easy',
    rpe: 3,
    tags: ['easy'],
    description: 'Conversational running. Slower is fine; if your heart rate drifts above zone 2, walk a few steps. Optional: 4–6 relaxed strides of 20 seconds at the end.',
    source: BASIC,
    durationSec: min(40),
    hrZone: 2,
  },
  {
    slug: 'run-long-90',
    name: 'Long run, 90′',
    sport: 'run',
    type: 'long',
    rpe: 4,
    tags: ['easy', 'long'],
    description: 'The long run of the week, steady and aerobic. Build the length by 10–15′ a week, and start the next hard run only once your legs feel normal again. Take water and a gel past 75′.',
    source: BASIC,
    durationSec: min(90),
    hrZone: 2,
  },

  // ---- Strength and recovery -------------------------------------------------------------
  {
    slug: 'strength-tri-a',
    name: 'Strength A: lower body and pull',
    sport: 'strength',
    type: 'lifting',
    rpe: 6,
    tags: ['strength'],
    description:
      'A 45′ session for endurance athletes, twice a week in the Norwegian block: heavy enough to build strength, with reps left in the tank so it doesn’t cost the next run. Squat and deadlift work is set from your 1RMs (Log › 1RMs); add them first.\n\nThe lifts are standard endurance-athlete choices, not a published programme.',
    source: 'Norwegian block: 45′ strength twice a week (' + SRC.norway + '). Exercise choice is standard endurance-athlete practice.',
    exercises: [
      { name: 'Back squat', sets: [{ id: '', reps: 5, pct: 70 }, { id: '', reps: 5, pct: 75 }, { id: '', reps: 5, pct: 75 }] },
      { name: 'Romanian deadlift', sets: [{ id: '', reps: 6, pct: 65 }, { id: '', reps: 6, pct: 65 }, { id: '', reps: 6, pct: 65 }] },
      { name: 'Pull-up or lat pulldown', sets: [{ id: '', reps: 8, rpe: 7 }, { id: '', reps: 8, rpe: 7 }, { id: '', reps: 8, rpe: 7 }] },
      { name: 'Calf raise', sets: [{ id: '', reps: 12, rpe: 7 }, { id: '', reps: 12, rpe: 7 }, { id: '', reps: 12, rpe: 7 }] },
    ],
  },
  {
    slug: 'strength-tri-b',
    name: 'Strength B: single leg and core',
    sport: 'strength',
    type: 'lifting',
    rpe: 5,
    tags: ['strength'],
    description: 'A lighter 30–40′ session for balance, hips and trunk, the things that hold your running together at the end of a race. Slow and controlled. Add weight only when every rep is clean.',
    source: 'Basic session; exercise choice is standard endurance-athlete practice.',
    exercises: [
      { name: 'Split squat', sets: [{ id: '', reps: 8, rpe: 6 }, { id: '', reps: 8, rpe: 6 }, { id: '', reps: 8, rpe: 6 }], notes: 'Each leg' },
      { name: 'Single-leg Romanian deadlift', sets: [{ id: '', reps: 8, rpe: 6 }, { id: '', reps: 8, rpe: 6 }, { id: '', reps: 8, rpe: 6 }], notes: 'Each leg' },
      { name: 'Side plank', sets: [{ id: '', reps: 1, rpe: 6 }, { id: '', reps: 1, rpe: 6 }], notes: '40–60 seconds each side' },
      { name: 'Dead bug', sets: [{ id: '', reps: 10, rpe: 5 }, { id: '', reps: 10, rpe: 5 }, { id: '', reps: 10, rpe: 5 }] },
    ],
  },
  {
    slug: 'recovery-mobility-20',
    name: 'Mobility, 20′',
    sport: 'recovery',
    type: 'mobility',
    rpe: 2,
    tags: ['easy'],
    description: 'Hips, hamstrings, calves, thoracic spine and shoulders: slow, a minute or so on each. A good use of a rest day or the evening after a double.',
    source: 'Basic session.',
    durationSec: min(20),
  },
]

const STARTER_AT = '2026-11-25T00:00:00.000Z'

/** A workout's id for a slug, fixed so the same one is never added twice. */
export const starterId = (slug: string) => `starter-${slug}`

function build(d: Def): Workout {
  const id = starterId(d.slug)
  return {
    id,
    name: d.name,
    sport: d.sport,
    type: d.type,
    description: d.description,
    tags: d.tags,
    rpe: d.rpe,
    durationSec: d.durationSec,
    distanceM: d.distanceM,
    hrZone: d.hrZone,
    pieces: d.pieces?.map((p, i) => ({ ...p, id: `${id}-p${i}` })),
    exercises: d.exercises?.map((e, i) => ({ ...e, id: `${id}-e${i}`, sets: e.sets.map((s, j) => ({ ...s, id: `${id}-e${i}-s${j}` })) })),
    source: d.source,
    createdAt: STARTER_AT,
    updatedAt: STARTER_AT,
  }
}

export const STARTER_WORKOUTS: Workout[] = DEFS.map(build)

/** The starter workouts not yet in the library. */
export const missingStarters = (have: Pick<Workout, 'id'>[]) => STARTER_WORKOUTS.filter((w) => !have.some((h) => h.id === w.id))
