// Bricks in a training block: which kinds of brick a block can use, a built-in set for when the
// library has none, and how long a brick takes. A brick is a library workout (or a one-off) with
// `legs`; the planner puts it in a week by letting it use up one session in each sport it covers.

import { newId } from '../log/format'
import type { Sport, Workout, WorkoutLeg } from '../log/types'
import { SEC_PER_M } from './oneOffs'
import type { Block, PlanEvent, OneOff } from './types'

const min = (m: number) => m * 60

/** Sports a brick can span, as the leg orders the planner builds. */
export const BRICK_SETS = {
  brick: ['bike', 'run'],
  swimBike: ['swim', 'bike'],
  triathlon: ['swim', 'bike', 'run'],
  duathlon: ['run', 'bike', 'run'],
} as const satisfies Record<string, readonly Sport[]>

/**
 * The leg orders a block can build bricks from, most useful first: bike–run whenever the block has
 * both; swim–bike when it has no run; a triathlon when it has all three; a duathlon when a duathlon
 * race is on its calendar. The planner rotates through them week by week.
 */
export function brickSets(block: Pick<Block, 'sports' | 'start' | 'weeks'>, events: PlanEvent[]): Sport[][] {
  const has = (s: Sport) => block.sports.some((b) => b.sport === s)
  const sets: Sport[][] = []
  if (has('bike') && has('run')) sets.push([...BRICK_SETS.brick])
  else if (has('swim') && has('bike')) sets.push([...BRICK_SETS.swimBike])
  if (has('swim') && has('bike') && has('run')) sets.push([...BRICK_SETS.triathlon])
  if (has('bike') && has('run') && events.some((e) => e.kind === 'race' && e.multisport === 'duathlon' && e.date >= block.start)) sets.push([...BRICK_SETS.duathlon])
  return sets
}

/** True when every sport of a brick's legs is one the block trains. */
export const blockCanDo = (block: Pick<Block, 'sports'>, legs: Sport[]) => legs.every((s) => block.sports.some((b) => b.sport === s))

/** Planned seconds for a brick: each leg's work and rest, a warm-up once, and a short change between legs. */
export function estimateBrickSec(legs: Pick<WorkoutLeg, 'sport' | 'durationSec' | 'distanceM' | 'pieces'>[]): number {
  const leg = (l: (typeof legs)[number]) => {
    const pace = SEC_PER_M[l.sport] ?? 0.25
    if (l.pieces?.length) {
      const work = l.pieces.reduce((a, p) => a + (p.durationSec ?? (p.distanceM ?? 0) * pace), 0)
      return work + l.pieces.slice(0, -1).reduce((a, p) => a + (p.restSec ?? 0), 0)
    }
    if (l.durationSec) return l.durationSec
    if (l.distanceM) return l.distanceM * pace
    return min(15)
  }
  return Math.round(legs.reduce((a, l) => a + leg(l), 0) + min(10) + Math.max(0, legs.length - 1) * min(2))
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const leg = (l: Omit<WorkoutLeg, 'id'>): WorkoutLeg => ({ ...l, id: newId(), pieces: l.pieces?.map((p) => ({ ...p, id: newId() })) })
const reps = (n: number, p: Omit<NonNullable<WorkoutLeg['pieces']>[number], 'id'>) => Array.from({ length: n }, () => ({ ...p, id: newId() }))

/**
 * A built-in brick for a leg order. `intensity` picks a steady-hard one or a hard one; `scale` grows
 * the reps with the week's volume; `short` is the sharpener for taper weeks. Targets are relative to
 * the athlete's FTP, threshold pace and CSS, or HR zones, so they turn into numbers from their markers.
 */
export function builtInBrick(legs: readonly Sport[], intensity: 'key' | 'moderate', scale: number, short = false): OneOff {
  const hard = intensity === 'key' && !short
  const n = clamp(Math.round((short ? 2 : 3) * scale), 2, 4)
  const css = { lo: -1, hi: 2 }

  const swim = (): WorkoutLeg => leg({ sport: 'swim', type: 'pool', pieces: reps(hard ? 8 : 6, { distanceM: 100, restSec: 15, rel: css }), notes: 'Even, at CSS' })
  const bikeBlocks = (): WorkoutLeg =>
    leg({
      sport: 'bike',
      type: hard ? 'intervals' : 'tempo',
      pieces: reps(n, short ? { durationSec: min(5), restSec: min(2), rel: { lo: 88, hi: 98 } } : hard ? { durationSec: min(10), restSec: min(3), rel: { lo: 91, hi: 100 } } : { durationSec: min(8), restSec: min(2), rel: { lo: 80, hi: 90 } }),
    })
  const bikeSteady = (minutes: number, lo: number, hi: number): WorkoutLeg => leg({ sport: 'bike', type: 'tempo', durationSec: min(minutes), rel: { lo, hi } })
  const runOff = (notes = 'Straight off the bike'): WorkoutLeg =>
    short
      ? leg({ sport: 'run', type: 'tempo', pieces: [{ id: newId(), distanceM: 1500, rel: { lo: -3, hi: 3 } }], notes })
      : hard
        ? leg({ sport: 'run', type: 'intervals', pieces: [{ id: newId(), distanceM: 2000, rel: { lo: -3, hi: 3 } }, { id: newId(), distanceM: 1000, rel: { hi: -8 } }], notes: `${notes}: 2 km at threshold, then 1 km faster` })
        : leg({ sport: 'run', type: 'tempo', durationSec: min(10), hrZone: 3, notes })

  const key = legs.join('-')
  if (key === 'swim-bike') {
    return brickOne('Swim–bike brick', 'swim', [swim(), bikeSteady(hard ? 40 : 30, 80, 90)], intensity, short, 'Straight from the pool onto the bike: the legs feel heavy for the first few minutes, so spin easily and then settle.')
  }
  if (key === 'swim-bike-run') {
    return brickOne(
      short ? 'Triathlon sharpener' : 'Triathlon rehearsal: swim, bike, run',
      'swim',
      [swim(), bikeSteady(short ? 15 : hard ? 40 : 30, hard ? 88 : 80, hard ? 98 : 90), runOff()],
      intensity,
      short,
      'The three legs back to back, changing over as you would in a race. Keep the swim controlled; the run is where a brick is learned.',
    )
  }
  if (key === 'run-bike-run') {
    return brickOne(
      short ? 'Duathlon sharpener' : 'Duathlon rehearsal: run, bike, run',
      'run',
      [
        leg({ sport: 'run', type: 'tempo', ...(short ? { distanceM: 1000 } : { durationSec: min(hard ? 12 : 10) }), ...(hard ? { rel: { lo: -3, hi: 3 } } : { hrZone: 3 }) }),
        bikeSteady(short ? 10 : hard ? 25 : 20, hard ? 88 : 80, hard ? 98 : 90),
        leg({ sport: 'run', type: 'tempo', ...(short ? { distanceM: 1000 } : { durationSec: min(hard ? 8 : 5) }), ...(hard ? { rel: { lo: -3, hi: 3 } } : { hrZone: 3 }), notes: 'Straight off the bike' }),
      ],
      intensity,
      short,
      'Run one controlled so run two still has something in it; hold the bike steady, then run the last leg as the race.',
    )
  }
  // Bike–run, the everyday brick.
  return brickOne(
    short ? 'Race-pace brick' : hard ? 'Threshold ride + run off the bike' : 'Tempo ride + run off the bike',
    'bike',
    [bikeBlocks(), runOff()],
    intensity,
    short,
    'A steady-hard ride, then a run straight off it to practise changing legs. The first kilometre feels awkward; settle into a rhythm rather than chasing pace.',
  )
}

function brickOne(name: string, sport: Sport, legs: WorkoutLeg[], intensity: 'key' | 'moderate', short: boolean, description: string): OneOff {
  return {
    name,
    sport,
    type: intensity === 'key' && !short ? 'intervals' : 'tempo',
    rpe: short ? 6 : intensity === 'key' ? 8 : 6,
    tags: ['brick'],
    description,
    legs,
    brickKind: legs.length === 3 ? (legs[0].sport === 'swim' ? 'triathlon' : 'duathlon') : 'brick',
  }
}

/** A planned brick's duration from its workout, or from one-off legs. */
export const brickSec = (w: Pick<Workout, 'legs'>) => estimateBrickSec(w.legs ?? [])
