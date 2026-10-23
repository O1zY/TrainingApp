// The session data model. Everything is stored in base SI-ish units
// (seconds, metres, watts, kg) and converted for display in format.ts.

export type Sport = 'row' | 'run' | 'bike' | 'strength' | 'recovery'

/** What the session was for. Drives whether the interval breakdown is shown. */
export type Intent =
  | 'easy'
  | 'steady'
  | 'long'
  | 'tempo'
  | 'threshold'
  | 'intervals'
  | 'race'
  | 'technique'
  | 'strength'
  | 'recovery'

export type Source = 'manual' | 'strava'

/** Metrics an interval can be targeted on. */
export type TargetMetric = 'power' | 'pace' | 'split' | 'hr' | 'rate'

/**
 * A target for one rep, in base units: watts, s/km (pace), s/500m (split),
 * bpm, strokes or steps per minute. Either bound can be left open, e.g.
 * "at least 300W" is { min: 300 }, "faster than 3:20/km" is { max: 200 }.
 */
export interface Target {
  metric: TargetMetric
  min?: number
  max?: number
}

/** One work rep inside an interval session, plus the rest that followed it. */
export interface Interval {
  /** Work duration in seconds. */
  durationS: number
  /** Work distance in metres (pace and split are derived from this). */
  distanceM?: number
  /** Rest after this rep, in seconds. */
  restS?: number
  avgPower?: number
  avgHR?: number
  maxHR?: number
  /** Stroke rate (rowing) or cadence (run/bike). */
  avgRate?: number
  target?: Target
  /** Heart-rate zone (1–5) this rep should sit in, checked against the athlete's zones. */
  hrZone?: number
}

export interface StrengthSet {
  reps: number
  weightKg?: number
}

export interface Exercise {
  name: string
  sets: StrengthSet[]
}

export type WodFormat = 'for-time' | 'amrap' | 'emom' | 'other'

/** CrossFit-style workout result, logged alongside or instead of exercises. */
export interface Wod {
  format: WodFormat
  description: string
  timeCapS?: number
  /** As scored: "12:45", "6 rounds + 8", etc. */
  result: string
}

interface BaseSession {
  id: string
  /** ISO date-time the session started. */
  start: string
  title: string
  intent: Intent
  source: Source
  /** Moving/working time in seconds. */
  durationS: number
  distanceM?: number
  avgHR?: number
  maxHR?: number
  /** Session RPE, 1–10 (CR-10 scale). */
  rpe?: number
  notes?: string
  /** Work reps for structured sessions. Easy/steady sessions leave this empty. */
  intervals?: Interval[]
}

export interface RowSession extends BaseSession {
  sport: 'row'
  environment: 'water' | 'erg'
  /** 1x, 2x, 2-, 4x, 4-, 8+ … (water only). */
  boat?: string
  avgRate?: number
  avgPower?: number
  dragFactor?: number
}

export interface RunSession extends BaseSession {
  sport: 'run'
  cadence?: number
  elevationGainM?: number
  surface?: 'road' | 'trail' | 'track' | 'treadmill'
}

export interface BikeSession extends BaseSession {
  sport: 'bike'
  indoor?: boolean
  avgPower?: number
  normalizedPower?: number
  cadence?: number
  elevationGainM?: number
}

export interface StrengthSession extends BaseSession {
  sport: 'strength'
  exercises?: Exercise[]
  wod?: Wod
}

export interface RecoverySession extends BaseSession {
  sport: 'recovery'
  activity: 'mobility' | 'yoga' | 'stretching' | 'massage' | 'sauna' | 'walk' | 'other'
}

export type Session = RowSession | RunSession | BikeSession | StrengthSession | RecoverySession
