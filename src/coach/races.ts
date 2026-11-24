import type { MultisportKind, Sport } from '../log/types'
import type { RaceFormat, RaceLeg } from './types'

// Standard leg distances, so picking "sprint duathlon" fills them in. British Triathlon's
// usual distances; any of them can be changed by hand, as many races run their own.

type Kind = Extract<MultisportKind, 'duathlon' | 'triathlon' | 'aquathlon'>

const km = (n: number) => n * 1000

const PRESETS: Record<Kind, Partial<Record<RaceFormat, [Sport, number][]>>> = {
  duathlon: {
    supersprint: [['run', km(2.5)], ['bike', km(10)], ['run', km(1.25)]],
    sprint: [['run', km(5)], ['bike', km(20)], ['run', km(2.5)]],
    standard: [['run', km(10)], ['bike', km(40)], ['run', km(5)]],
    middle: [['run', km(10)], ['bike', km(60)], ['run', km(10)]],
  },
  triathlon: {
    supersprint: [['swim', 400], ['bike', km(10)], ['run', km(2.5)]],
    sprint: [['swim', 750], ['bike', km(20)], ['run', km(5)]],
    standard: [['swim', 1500], ['bike', km(40)], ['run', km(10)]],
    middle: [['swim', 1900], ['bike', km(90)], ['run', km(21.1)]],
    long: [['swim', 3800], ['bike', km(180)], ['run', km(42.2)]],
  },
  aquathlon: {
    sprint: [['swim', 750], ['run', km(5)]],
    standard: [['swim', 1000], ['run', km(10)]],
  },
}

export const FORMAT_LABEL: Record<RaceFormat, string> = {
  supersprint: 'Super sprint',
  sprint: 'Sprint',
  standard: 'Standard',
  middle: 'Middle',
  long: 'Long',
  other: 'Other',
}

/** Formats with standard distances for this kind of race. */
export function formatsFor(kind: MultisportKind | undefined): RaceFormat[] {
  const p = kind && kind in PRESETS ? PRESETS[kind as Kind] : undefined
  return p ? [...(Object.keys(p) as RaceFormat[]), 'other'] : []
}

/** The standard legs for a format, or undefined when there's no standard (fill by hand). */
export function presetLegs(kind: MultisportKind | undefined, format: RaceFormat): RaceLeg[] | undefined {
  const p = kind && kind in PRESETS ? PRESETS[kind as Kind][format] : undefined
  return p?.map(([sport, distanceM]) => ({ sport, distanceM }))
}

/** Legs to start from when the race is a single sport or a format without presets. */
export function blankLegs(kind: MultisportKind | undefined, sport: Sport | undefined): RaceLeg[] {
  if (kind === 'duathlon') return [{ sport: 'run', distanceM: 0 }, { sport: 'bike', distanceM: 0 }, { sport: 'run', distanceM: 0 }]
  if (kind === 'triathlon') return [{ sport: 'swim', distanceM: 0 }, { sport: 'bike', distanceM: 0 }, { sport: 'run', distanceM: 0 }]
  if (kind === 'aquathlon') return [{ sport: 'swim', distanceM: 0 }, { sport: 'run', distanceM: 0 }]
  return sport ? [{ sport, distanceM: 0 }] : []
}
