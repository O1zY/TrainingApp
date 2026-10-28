import { newId } from '../log/format'
import type { ExerciseTemplate, PieceTemplate, Sport, Wod } from '../log/types'
import type { Intensity, OneOff } from './types'

// Built-in one-off sessions the planner rotates through for variety between the
// library sessions. Structures only: targets come from HR zones and RPE, as pace
// and watts depend on the athlete.

interface Reps {
  n: number
  distanceM?: number
  durationSec?: number
  restSec?: number
  hrZone?: number
  targetRate?: number
  notes?: string
}

interface Spec {
  name: string
  type?: string
  rpe: number
  description?: string
  reps?: Reps[]
  /** Steady sessions: share of the easy length (1 = easy length). */
  share?: number
  minutes?: number
  hrZone?: number
  targetRate?: number
  lifts?: [name: string, sets: number, reps: number, pct?: number][]
  wod?: Pick<Wod, 'format' | 'description' | 'timeCapSec'>
}

const min = (m: number) => m * 60

const BANK: Partial<Record<Sport, Record<Exclude<Intensity, 'race'>, Spec[]>>> = {
  erg: {
    key: [
      { name: '4 × 2k', type: 'intervals', rpe: 8, reps: [{ n: 4, distanceM: 2000, restSec: min(5), hrZone: 4 }] },
      { name: '8 × 500m', type: 'intervals', rpe: 9, reps: [{ n: 8, distanceM: 500, restSec: 90, hrZone: 5 }] },
      { name: '3 × 12′ threshold', type: 'intervals', rpe: 7, reps: [{ n: 3, durationSec: min(12), restSec: min(3), hrZone: 4, targetRate: 24 }] },
      { name: '5 × 1500m', type: 'intervals', rpe: 8, reps: [{ n: 5, distanceM: 1500, restSec: min(4), hrZone: 4 }] },
      { name: '20 × 1′ on, 1′ off', type: 'intervals', rpe: 9, reps: [{ n: 20, durationSec: 60, restSec: 60, hrZone: 5 }] },
      {
        name: 'Pyramid 1-2-3-4-3-2-1′',
        type: 'intervals',
        rpe: 8,
        reps: [1, 2, 3, 4, 3, 2, 1].map((m) => ({ n: 1, durationSec: min(m), restSec: min(m), hrZone: 5 })),
      },
      { name: '2 × 20′ at r22', type: 'intervals', rpe: 7, reps: [{ n: 2, durationSec: min(20), restSec: min(5), hrZone: 3, targetRate: 22 }] },
    ],
    moderate: [
      { name: '3 × 10′ UT1', type: 'intervals', rpe: 6, reps: [{ n: 3, durationSec: min(10), restSec: min(3), hrZone: 3, targetRate: 20 }] },
      { name: '6 × 3′ rate builds', type: 'intervals', rpe: 6, description: 'Each piece 1′ each at r20, r22, r24.', reps: [{ n: 6, durationSec: min(3), restSec: min(2), hrZone: 3 }] },
    ],
    easy: [
      { name: 'UT2 steady', type: 'steady', rpe: 3, share: 1, hrZone: 2, targetRate: 18 },
      { name: 'UT2 3 × 20′', type: 'steady', rpe: 3, description: 'Split into thirds with a minute off to stretch.', share: 1, hrZone: 2, targetRate: 20 },
      { name: 'Steady with rate ladder', type: 'steady', rpe: 3, description: 'Every 10′: 8′ at r18, 2′ at r22.', share: 1, hrZone: 2 },
    ],
  },
  row: {
    key: [
      { name: '3 × 2km pieces', type: 'pieces', rpe: 8, reps: [{ n: 3, distanceM: 2000, restSec: min(6), hrZone: 4 }] },
      { name: '6 × 500m', type: 'pieces', rpe: 9, reps: [{ n: 6, distanceM: 500, restSec: min(3), hrZone: 5 }] },
      { name: '4 × 6′ at r28', type: 'pieces', rpe: 8, reps: [{ n: 4, durationSec: min(6), restSec: min(4), hrZone: 4, targetRate: 28 }] },
      { name: '10 × 1′ on, 1′ off', type: 'pieces', rpe: 9, reps: [{ n: 10, durationSec: 60, restSec: 60, hrZone: 5 }] },
    ],
    moderate: [{ name: '3 × 10′ at r20–22', type: 'pieces', rpe: 6, reps: [{ n: 3, durationSec: min(10), restSec: min(3), hrZone: 3, targetRate: 21 }] }],
    easy: [
      { name: 'Steady state', type: 'steady', rpe: 3, share: 1, hrZone: 2, targetRate: 18 },
      { name: 'Technique and steady', type: 'technique', rpe: 3, description: 'Drills for the first 20′ (pause, feet-out, square blade), then steady.', share: 1, hrZone: 2 },
    ],
  },
  run: {
    key: [
      { name: '6 × 800m', type: 'intervals', rpe: 8, reps: [{ n: 6, distanceM: 800, restSec: min(2), hrZone: 5 }] },
      { name: '5 × 1km', type: 'intervals', rpe: 8, reps: [{ n: 5, distanceM: 1000, restSec: min(2), hrZone: 4 }] },
      { name: '4 × 1600m', type: 'intervals', rpe: 8, reps: [{ n: 4, distanceM: 1600, restSec: min(3), hrZone: 4 }] },
      { name: '10 × 400m', type: 'intervals', rpe: 9, reps: [{ n: 10, distanceM: 400, restSec: 90, hrZone: 5 }] },
      { name: '8 × 60s hills', type: 'intervals', rpe: 9, description: 'Steady hill, jog back down.', reps: [{ n: 8, durationSec: 60, restSec: min(2), hrZone: 5 }] },
      { name: '3 × 2km threshold', type: 'tempo', rpe: 7, reps: [{ n: 3, distanceM: 2000, restSec: min(3), hrZone: 4 }] },
      { name: '20′ tempo', type: 'tempo', rpe: 7, reps: [{ n: 1, durationSec: min(20), hrZone: 4 }] },
    ],
    moderate: [
      { name: '6 × 2′ steady-quick', type: 'tempo', rpe: 6, reps: [{ n: 6, durationSec: min(2), restSec: 60, hrZone: 3 }] },
      { name: 'Fartlek 8 × 1′', type: 'intervals', rpe: 6, reps: [{ n: 8, durationSec: 60, restSec: 90, hrZone: 4 }] },
    ],
    easy: [
      { name: 'Easy run', type: 'easy', rpe: 3, share: 1, hrZone: 2 },
      { name: 'Easy run + strides', type: 'easy', rpe: 3, description: 'Finish with 6 × 20s strides, walk back.', share: 1, hrZone: 2 },
    ],
  },
  bike: {
    key: [
      { name: '4 × 8′ threshold', type: 'intervals', rpe: 8, reps: [{ n: 4, durationSec: min(8), restSec: min(4), hrZone: 4 }] },
      { name: '3 × 12′ sweet spot', type: 'intervals', rpe: 7, reps: [{ n: 3, durationSec: min(12), restSec: min(5), hrZone: 4 }] },
      { name: '6 × 3′ VO2', type: 'intervals', rpe: 9, reps: [{ n: 6, durationSec: min(3), restSec: min(3), hrZone: 5 }] },
      { name: '2 × 20′ tempo', type: 'tempo', rpe: 7, reps: [{ n: 2, durationSec: min(20), restSec: min(5), hrZone: 3 }] },
      { name: '10 × 1′ hard', type: 'intervals', rpe: 9, reps: [{ n: 10, durationSec: 60, restSec: 60, hrZone: 5 }] },
    ],
    moderate: [{ name: '3 × 10′ tempo', type: 'tempo', rpe: 6, reps: [{ n: 3, durationSec: min(10), restSec: min(5), hrZone: 3 }] }],
    easy: [
      { name: 'Endurance ride', type: 'endurance', rpe: 3, share: 1, hrZone: 2 },
      { name: 'Endurance + high cadence', type: 'endurance', rpe: 3, description: '5 × 1′ at 110+ rpm spread through.', share: 1, hrZone: 2 },
    ],
  },
  swim: {
    key: [
      { name: '10 × 100m', type: 'intervals', rpe: 8, reps: [{ n: 10, distanceM: 100, restSec: 20, hrZone: 4 }] },
      { name: '5 × 200m', type: 'intervals', rpe: 8, reps: [{ n: 5, distanceM: 200, restSec: 30, hrZone: 4 }] },
      { name: '20 × 50m', type: 'intervals', rpe: 9, reps: [{ n: 20, distanceM: 50, restSec: 15, hrZone: 5 }] },
      { name: '4 × 400m', type: 'intervals', rpe: 7, reps: [{ n: 4, distanceM: 400, restSec: 45, hrZone: 3 }] },
    ],
    moderate: [{ name: '8 × 100m steady', type: 'intervals', rpe: 6, reps: [{ n: 8, distanceM: 100, restSec: 20, hrZone: 3 }] }],
    easy: [{ name: 'Easy swim', type: 'pool', rpe: 3, share: 1, hrZone: 2 }],
  },
  strength: {
    key: [
      { name: 'Lower strength', type: 'lifting', rpe: 8, lifts: [['Back squat', 5, 5, 80], ['Romanian deadlift', 3, 8], ['Hip thrust', 3, 8]] },
      { name: 'Upper strength', type: 'lifting', rpe: 8, lifts: [['Bench press', 5, 5, 80], ['Bent-over row', 4, 6, 75], ['Pull-up', 4, 6]] },
      { name: 'Full-body power', type: 'lifting', rpe: 8, lifts: [['Power clean', 5, 3, 70], ['Front squat', 4, 4, 75], ['Push press', 4, 5, 70]] },
      { name: 'Deadlift day', type: 'lifting', rpe: 8, lifts: [['Deadlift', 5, 3, 82], ['Overhead press', 4, 6, 72], ['Hip thrust', 3, 10]] },
      {
        name: '15′ AMRAP',
        type: 'wod',
        rpe: 8,
        wod: { format: 'amrap', timeCapSec: min(15), description: '10 wall balls\n10 kettlebell swings\n10 box jumps\n200m run' },
      },
    ],
    moderate: [
      { name: 'Strength maintenance', type: 'lifting', rpe: 6, lifts: [['Back squat', 3, 5, 65], ['Bench press', 3, 5, 65], ['Bent-over row', 3, 6, 65]] },
    ],
    easy: [
      {
        name: 'Accessory circuit',
        type: 'circuit',
        rpe: 4,
        share: 0.6,
        description: '3 rounds: 10 goblet squats, 10 push-ups, 10 single-arm rows each side, 10 back extensions, 45s plank.',
      },
    ],
  },
  recovery: {
    key: [],
    moderate: [],
    easy: [
      { name: 'Mobility', type: 'mobility', rpe: 1, minutes: 20, description: 'Hips, T-spine, ankles and hamstrings.' },
      { name: 'Yoga flow', type: 'yoga', rpe: 2, minutes: 30 },
      { name: 'Foam roll and stretch', type: 'foam', rpe: 1, minutes: 20 },
    ],
  },
}

const GENERIC: Record<Exclude<Intensity, 'race'>, Spec[]> = {
  key: [{ name: 'Hard session', rpe: 8 }],
  moderate: [{ name: 'Steady-hard session', rpe: 6 }],
  easy: [{ name: 'Easy session', rpe: 3, share: 1, hrZone: 2 }],
}

/** Rough work pace in seconds per metre, for estimating how long distance reps take. */
const SEC_PER_M: Partial<Record<Sport, number>> = { erg: 0.22, row: 0.24, run: 0.27, bike: 0.12, swim: 1.1 }
/** Warm-up and cool-down around interval sessions. */
const WARM_SEC = min(25)

export function specsFor(sport: Sport, intensity: Exclude<Intensity, 'race'>) {
  const list = BANK[sport]?.[intensity]
  return list?.length ? list : GENERIC[intensity]
}

/** Planned minutes, rounded to 5. */
const round5 = (m: number) => Math.max(5, Math.round(m / 5) * 5)

/**
 * Builds a one-off from a spec. `scale` grows rep counts and steady lengths with the
 * week's volume (so a build-3 week has a rep or two more than build 1).
 */
export function buildOneOff(sport: Sport, spec: Spec, easyMin: number, scale: number): OneOff {
  const pieces: PieceTemplate[] | undefined = spec.reps?.flatMap((r) => {
    const n = r.n > 1 ? Math.max(2, Math.round(r.n * scale)) : 1
    return Array.from({ length: n }, () => ({
      id: newId(),
      distanceM: r.distanceM,
      durationSec: r.durationSec,
      restSec: r.restSec,
      hrZone: r.hrZone,
      targetRate: r.targetRate,
      notes: r.notes,
    }))
  })
  const exercises: ExerciseTemplate[] | undefined = spec.lifts?.map(([name, sets, reps, pct]) => ({
    id: newId(),
    name,
    sets: Array.from({ length: Math.max(2, Math.round(sets * Math.min(scale, 1.2))) }, () => ({ id: newId(), reps, pct })),
  }))
  const steady = !pieces && !exercises && !spec.wod
  const minutes = spec.minutes ?? (steady ? round5(easyMin * (spec.share ?? 1) * scale) : undefined)
  return {
    name: spec.name,
    sport,
    type: spec.type,
    description: spec.description,
    tags: [],
    rpe: spec.rpe,
    hrZone: steady ? spec.hrZone : undefined,
    targetRate: steady ? spec.targetRate : undefined,
    durationSec: minutes ? min(minutes) : undefined,
    pieces,
    exercises,
    wod: spec.wod,
  }
}

/** How long a workout should take, start to finish, including warm-up for intervals. */
export function estimateSec(w: Pick<OneOff, 'sport' | 'durationSec' | 'distanceM' | 'pieces' | 'exercises' | 'wod'>): number {
  const pace = SEC_PER_M[w.sport] ?? 0.25
  if (w.pieces?.length) {
    const work = w.pieces.reduce((a, p) => a + (p.durationSec ?? (p.distanceM ?? 0) * pace), 0)
    const rest = w.pieces.slice(0, -1).reduce((a, p) => a + (p.restSec ?? 0), 0)
    return Math.round(work + rest + WARM_SEC)
  }
  if (w.exercises?.length) {
    const sets = w.exercises.reduce((a, e) => a + e.sets.length, 0)
    return sets * 180 + min(10) + (w.wod?.timeCapSec ?? 0)
  }
  if (w.wod) return (w.wod.timeCapSec ?? min(15)) + min(20)
  if (w.durationSec) return w.durationSec
  if (w.distanceM) return Math.round(w.distanceM * pace)
  return min(45)
}
