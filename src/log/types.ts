// Data model for logged training. Everything is stored in metric (metres, seconds, kg);
// the UI converts to the user's units on the way in and out.

export type Sport = 'row' | 'erg' | 'run' | 'bike' | 'swim' | 'strength' | 'recovery' | 'other' | 'transition'

export type SessionStatus = 'completed' | 'planned' | 'skipped'
export type SessionSource = 'manual' | 'strava'

/** Metrics a rep or session can be targeted on. */
export type TargetMetric = 'pace' | 'power' | 'hr' | 'rate'

/**
 * A target in base units: pace in seconds per km for every sport (shown as /500m,
 * /100m, /km, /mi or speed depending on sport), watts, bpm, strokes or rpm per minute.
 * Either bound can be open: "1:40/500m or faster" is { metric: 'pace', max: 200 }.
 */
export interface Target {
  metric: TargetMetric
  min?: number
  max?: number
}

/** What a rep or session was meant to be. Shared by logged sessions and library workouts. */
export interface Aim {
  target?: Target
  /** Heart-rate zone 1–5, checked against the zones in Settings. */
  hrZone?: number
  /** Stroke rate or cadence to hold. Shown alongside the actual, not graded. */
  targetRate?: number
}

/** One work interval, with the rest that followed it. */
export interface Piece extends Aim {
  id: string
  distanceM?: number
  durationSec?: number
  /** Stroke rate (row/erg), cadence (run/bike). */
  rate?: number
  watts?: number
  hrAvg?: number
  hrMax?: number
  restSec?: number
  notes?: string
}

export interface StrengthSet {
  id: string
  reps?: number
  weightKg?: number
  rpe?: number
  warmup?: boolean
}

export interface ExerciseEntry {
  id: string
  name: string
  /** 1RM at the time of the session, so % stays correct after the 1RM changes. */
  oneRmKg?: number
  sets: StrengthSet[]
  notes?: string
}

export type WodFormat = 'amrap' | 'fortime' | 'emom' | 'other'

export interface Wod {
  format: WodFormat
  description?: string
  timeCapSec?: number
  rounds?: number
  reps?: number
  resultSec?: number
  rx?: boolean
}

export interface Session extends Aim {
  id: string
  sport: Sport
  /** Sport-specific session type, e.g. 'intervals', 'steady'. */
  type?: string
  title?: string
  /** YYYY-MM-DD, local date. */
  date: string
  /** HH:MM or HH:MM:SS, local time. Seconds matter for multisport transitions. */
  startTime?: string
  durationSec?: number
  distanceM?: number
  elevationM?: number

  rpe?: number
  hrAvg?: number
  hrMax?: number
  /** Seconds in heart-rate zones 1–5. */
  zonesSec?: (number | undefined)[]

  rate?: number
  watts?: number
  normWatts?: number
  dragFactor?: number
  indoor?: boolean

  pieces?: Piece[]
  exercises?: ExerciseEntry[]
  wod?: Wod

  feel?: string[]
  notes?: string

  status: SessionStatus
  source: SessionSource
  /** Strava activity id once imports exist. */
  externalId?: string
  multisportId?: string
  /** Library workout this session was logged from. */
  workoutId?: string
  /** Planned session this was logged against, for planned vs done. */
  planId?: string

  createdAt: string
  updatedAt: string
}

export type MultisportKind = 'duathlon' | 'triathlon' | 'aquathlon' | 'brick' | 'other'

/** Links separate sessions (legs) into one event. Transitions are explicit 'transition' legs or worked out from the gaps. */
export interface Multisport {
  id: string
  kind: MultisportKind
  title?: string
  date: string
  /** Leg session ids in race order. */
  legIds: string[]
  race?: boolean
  notes?: string
  createdAt: string
  updatedAt: string
}

/** Daily check-in. Scales are 1 (bad) – 5 (good) except soreness/fatigue/stress where 1 = none. */
export interface Wellbeing {
  date: string
  sleepHours?: number
  sleepQuality?: number
  restingHr?: number
  hrv?: number
  weightKg?: number
  energy?: number
  mood?: number
  motivation?: number
  soreness?: number
  fatigue?: number
  stress?: number
  illness?: boolean
  injury?: string
  notes?: string
  updatedAt: string
}

export interface OneRepMax {
  exercise: string
  kg: number
  date: string
}

// ---- Library ------------------------------------------------------------

/** A rep in a library workout: the fixed part (distance or time), rest and what to aim for. */
export interface PieceTemplate extends Aim {
  id: string
  distanceM?: number
  durationSec?: number
  restSec?: number
  notes?: string
}

/** A planned set: a % of the lifter's current 1RM, or a fixed weight. */
export interface SetTemplate {
  id: string
  reps?: number
  pct?: number
  weightKg?: number
  rpe?: number
  warmup?: boolean
}

export interface ExerciseTemplate {
  id: string
  name: string
  sets: SetTemplate[]
  notes?: string
}

/** A reusable session in the library. Logging from it pre-fills a Session. */
export interface Workout extends Aim {
  id: string
  name: string
  sport: Sport
  type?: string
  description?: string
  tags: string[]
  /** Whole-session plan, mainly for steady work, e.g. 60′ in Z2 at r18. */
  durationSec?: number
  distanceM?: number
  rpe?: number
  pieces?: PieceTemplate[]
  exercises?: ExerciseTemplate[]
  wod?: Pick<Wod, 'format' | 'description' | 'timeCapSec'>
  /** Where it comes from: a paper, coach, book or link. */
  source?: string
  createdAt: string
  updatedAt: string
}
