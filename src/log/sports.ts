import { Activity, ArrowLeftRight, Bike, Droplets, Dumbbell, Footprints, Gauge, HeartPulse, Waves, type LucideIcon } from 'lucide-react'
import type { Multisport, MultisportKind, Sport, WodFormat } from './types'

export interface SportDef {
  label: string
  icon: LucideIcon
  /** Literal class names so Tailwind picks them up. */
  text: string
  bg: string
  soft: string
  types: { value: string; label: string }[]
  /** Interval pieces make sense for this sport. */
  pieces: boolean
}

export const SPORTS: Record<Sport, SportDef> = {
  row: {
    label: 'On-water',
    icon: Waves,
    text: 'text-sport-row',
    bg: 'bg-sport-row',
    soft: 'bg-sport-row/15',
    pieces: true,
    types: [
      { value: 'steady', label: 'Steady state' },
      { value: 'technique', label: 'Technique' },
      { value: 'pieces', label: 'Pieces' },
      { value: 'race', label: 'Race' },
    ],
  },
  erg: {
    label: 'Erg',
    icon: Gauge,
    text: 'text-sport-row',
    bg: 'bg-sport-row',
    soft: 'bg-sport-row/15',
    pieces: true,
    types: [
      { value: 'steady', label: 'Steady state' },
      { value: 'intervals', label: 'Intervals' },
      { value: 'test', label: 'Test' },
      { value: 'race', label: 'Race' },
    ],
  },
  run: {
    label: 'Run',
    icon: Footprints,
    text: 'text-sport-run',
    bg: 'bg-sport-run',
    soft: 'bg-sport-run/15',
    pieces: true,
    types: [
      { value: 'easy', label: 'Easy' },
      { value: 'tempo', label: 'Tempo' },
      { value: 'intervals', label: 'Intervals' },
      { value: 'long', label: 'Long' },
      { value: 'race', label: 'Race' },
      { value: 'recovery', label: 'Recovery' },
    ],
  },
  bike: {
    label: 'Bike',
    icon: Bike,
    text: 'text-sport-bike',
    bg: 'bg-sport-bike',
    soft: 'bg-sport-bike/15',
    pieces: true,
    types: [
      { value: 'endurance', label: 'Endurance' },
      { value: 'tempo', label: 'Tempo' },
      { value: 'intervals', label: 'Intervals' },
      { value: 'race', label: 'Race' },
      { value: 'commute', label: 'Commute' },
    ],
  },
  swim: {
    label: 'Swim',
    icon: Droplets,
    text: 'text-sport-swim',
    bg: 'bg-sport-swim',
    soft: 'bg-sport-swim/15',
    pieces: true,
    types: [
      { value: 'pool', label: 'Pool' },
      { value: 'open', label: 'Open water' },
      { value: 'intervals', label: 'Intervals' },
      { value: 'race', label: 'Race' },
    ],
  },
  strength: {
    label: 'Strength',
    icon: Dumbbell,
    text: 'text-sport-strength',
    bg: 'bg-sport-strength',
    soft: 'bg-sport-strength/15',
    pieces: false,
    types: [
      { value: 'lifting', label: 'Lifting' },
      { value: 'wod', label: 'CrossFit WOD' },
      { value: 'mixed', label: 'Lifting + WOD' },
      { value: 'circuit', label: 'Circuit' },
    ],
  },
  recovery: {
    label: 'Recovery',
    icon: HeartPulse,
    text: 'text-sport-recovery',
    bg: 'bg-sport-recovery',
    soft: 'bg-sport-recovery/15',
    pieces: false,
    types: [
      { value: 'mobility', label: 'Mobility' },
      { value: 'stretching', label: 'Stretching' },
      { value: 'yoga', label: 'Yoga' },
      { value: 'foam', label: 'Foam rolling' },
      { value: 'massage', label: 'Massage' },
      { value: 'sauna', label: 'Sauna' },
      { value: 'ice', label: 'Ice bath' },
      { value: 'walk', label: 'Walk' },
    ],
  },
  other: {
    label: 'Other',
    icon: Activity,
    text: 'text-muted',
    bg: 'bg-muted',
    soft: 'bg-surface-2',
    pieces: false,
    types: [],
  },
  transition: {
    label: 'Transition',
    icon: ArrowLeftRight,
    text: 'text-muted',
    bg: 'bg-muted',
    soft: 'bg-surface-2',
    pieces: false,
    types: [],
  },
}

/** Sports offered when logging a standalone session. */
export const LOGGABLE: Sport[] = ['erg', 'row', 'run', 'bike', 'swim', 'strength', 'recovery', 'other']

/** Sports offered for a multisport leg. */
export const LEG_SPORTS: Sport[] = ['run', 'bike', 'swim', 'row', 'erg', 'transition', 'other']

export function sessionName(s: { sport: Sport; type?: string; title?: string }) {
  if (s.title) return s.title
  const def = SPORTS[s.sport]
  const type = def.types.find((t) => t.value === s.type)?.label
  return type ? `${def.label} · ${type}` : def.label
}

/** Templates leave transitions out: they're worked out from the gaps unless logged as their own leg. */
export const MULTISPORT_KINDS: { value: MultisportKind; label: string; legs: Sport[] }[] = [
  { value: 'duathlon', label: 'Duathlon', legs: ['run', 'bike', 'run'] },
  { value: 'triathlon', label: 'Triathlon', legs: ['swim', 'bike', 'run'] },
  { value: 'aquathlon', label: 'Aquathlon', legs: ['swim', 'run'] },
  { value: 'brick', label: 'Brick', legs: ['bike', 'run'] },
  { value: 'other', label: 'Other', legs: [] },
]

export const kindLabel = (k: MultisportKind) => MULTISPORT_KINDS.find((x) => x.value === k)!.label
export const eventName = (m: Pick<Multisport, 'title' | 'kind'>) => m.title || kindLabel(m.kind)

export const WOD_FORMATS: { value: WodFormat; label: string }[] = [
  { value: 'amrap', label: 'AMRAP' },
  { value: 'fortime', label: 'For time' },
  { value: 'emom', label: 'EMOM' },
  { value: 'other', label: 'Other' },
]

export const FEEL_TAGS = ['Strong', 'Good', 'Flat', 'Tired', 'Sore', 'Niggle', 'Ill', 'Hot', 'Cold', 'Windy']

/** Borg CR10 descriptors. */
export const RPE_LABELS: Record<number, string> = {
  1: 'Very easy',
  2: 'Easy',
  3: 'Moderate',
  4: 'Somewhat hard',
  5: 'Hard',
  6: 'Hard+',
  7: 'Very hard',
  8: 'Very hard+',
  9: 'Near max',
  10: 'Max',
}

export const MAIN_LIFTS = [
  'Back squat',
  'Front squat',
  'Deadlift',
  'Bench press',
  'Overhead press',
  'Push press',
  'Power clean',
  'Clean & jerk',
  'Snatch',
  'Bent-over row',
  'Pull-up',
  'Hip thrust',
  'Romanian deadlift',
]
