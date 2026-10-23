// Example sessions so the feed and session views have something to show
// before logging and storage exist. Delete once real data is wired up.

import type { Interval, Session, Target } from './types'

function daysAgo(n: number, hour: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

/** Concept2 watts from a /500m split. */
const ergWatts = (splitS: number) => Math.round(2.8 / (splitS / 500) ** 3)

const ergReps = (splits: number[], rates: number[], hrs: number[], target: Target): Interval[] =>
  splits.map((sp, i) => ({
    distanceM: 1500,
    durationS: sp * 3,
    restS: i < splits.length - 1 ? 300 : undefined,
    avgPower: ergWatts(sp),
    avgRate: rates[i],
    avgHR: hrs[i],
    target,
    hrZone: 4,
  }))

const runReps = (paces: number[], hrs: number[], target: Target): Interval[] =>
  paces.map((p, i) => ({
    distanceM: 1000,
    durationS: p,
    restS: i < paces.length - 1 ? 90 : undefined,
    avgHR: hrs[i],
    avgRate: 186,
    target,
    hrZone: 4,
  }))

export const SAMPLE_SESSIONS: Session[] = [
  {
    id: 's1',
    sport: 'row',
    environment: 'erg',
    start: daysAgo(0, 7),
    title: '5 × 1500m',
    intent: 'intervals',
    source: 'manual',
    durationS: 3420,
    distanceM: 12100,
    avgHR: 158,
    maxHR: 184,
    avgRate: 24,
    avgPower: 241,
    dragFactor: 118,
    rpe: 8,
    notes: 'Rep 4 dropped off — legs went at 1000m. Held rate 28 on the rest.',
    intervals: ergReps([99.2, 98.8, 99.5, 100.6, 98.4], [28, 28, 28, 27, 29], [171, 176, 179, 180, 183], { metric: 'split', min: 98, max: 100 }),
  },
  {
    id: 's2',
    sport: 'run',
    start: daysAgo(1, 18),
    title: '6 × 1km track',
    intent: 'intervals',
    source: 'strava',
    durationS: 3060,
    distanceM: 11400,
    avgHR: 152,
    maxHR: 181,
    rpe: 7,
    surface: 'track',
    intervals: runReps([212, 211, 216, 213, 222, 208], [154, 160, 166, 170, 174, 178], { metric: 'pace', min: 210, max: 215 }),
  },
  {
    id: 's3',
    sport: 'run',
    start: daysAgo(2, 7),
    title: 'Easy run',
    intent: 'easy',
    source: 'strava',
    durationS: 3150,
    distanceM: 10000,
    avgHR: 139,
    maxHR: 151,
    cadence: 176,
    elevationGainM: 84,
    rpe: 3,
    surface: 'road',
  },
  {
    id: 's4',
    sport: 'bike',
    start: daysAgo(3, 19),
    title: 'Sweet spot 3 × 10min',
    intent: 'threshold',
    source: 'manual',
    indoor: true,
    durationS: 3600,
    distanceM: 33500,
    avgHR: 146,
    maxHR: 165,
    avgPower: 221,
    normalizedPower: 241,
    cadence: 89,
    rpe: 6,
    intervals: [262, 266, 258].map((w, i) => ({
      durationS: 600,
      restS: i < 2 ? 300 : undefined,
      avgPower: w,
      avgHR: 154 + i * 5,
      avgRate: 90,
      target: { metric: 'power', min: 255, max: 270 },
      hrZone: 3,
    })),
  },
  {
    id: 's5',
    sport: 'row',
    environment: 'water',
    boat: '1x',
    start: daysAgo(4, 8),
    title: 'Steady state',
    intent: 'steady',
    source: 'strava',
    durationS: 4980,
    distanceM: 16000,
    avgHR: 141,
    maxHR: 156,
    avgRate: 20,
    rpe: 4,
    notes: 'Headwind on the way back. Worked on catch timing.',
  },
  {
    id: 's6',
    sport: 'strength',
    start: daysAgo(5, 17),
    title: 'Lower body + pull',
    intent: 'strength',
    source: 'manual',
    durationS: 3300,
    rpe: 7,
    exercises: [
      { name: 'Back squat', sets: Array.from({ length: 5 }, () => ({ reps: 5, weightKg: 100 })) },
      { name: 'Romanian deadlift', sets: Array.from({ length: 3 }, () => ({ reps: 8, weightKg: 80 })) },
      { name: 'Pull-up', sets: Array.from({ length: 4 }, () => ({ reps: 8 })) },
    ],
  },
  {
    id: 's7',
    sport: 'strength',
    start: daysAgo(6, 12),
    title: 'Fran',
    intent: 'intervals',
    source: 'manual',
    durationS: 1500,
    rpe: 9,
    wod: { format: 'for-time', description: '21-15-9 thrusters (43kg) and pull-ups', timeCapS: 600, result: '7:42' },
  },
  {
    id: 's8',
    sport: 'recovery',
    activity: 'mobility',
    start: daysAgo(6, 20),
    title: 'Hips and T-spine',
    intent: 'recovery',
    source: 'manual',
    durationS: 1500,
    rpe: 1,
  },
]
