// The athlete profile: what the coach needs to know before it builds a plan, beyond what
// the log, Strava and the work calendar already show. Filled in once on Plan › Coach
// screening and kept up to date; later plans and reviews reuse it.

import type { Sport } from '../log/types'

/** Standard race formats, so leg distances don't have to be typed. */
export type RaceFormat = 'supersprint' | 'sprint' | 'standard' | 'middle' | 'long' | 'other'

export type RaceAim = 'finish' | 'pb' | 'qualify' | 'place'

export type Experience = 'first' | 'some' | 'experienced'

/** One leg of the goal race, in race order. */
export interface RaceLeg {
  sport: Sport
  distanceM: number
}

export interface Goal {
  /** The race on Plan › Races & events this plan is for (date, priority and format live there). */
  eventId?: string
  format?: RaceFormat
  legs: RaceLeg[]
  aim?: RaceAim
  /** Target finish time. */
  targetSec?: number
  /** E.g. "top 4 in age group at Thruxton for a GB age-group place". */
  aimNotes?: string
  experience?: Experience
}

/**
 * General health questions asked before any exercise programme, in the spirit of the
 * PAR-Q+ (the standard pre-participation screen). Any "yes" means checking with a doctor
 * before hard training; the coach won't plan intensity until it's answered.
 */
export interface HealthScreen {
  heart?: boolean
  chestPain?: boolean
  dizziness?: boolean
  chronicCondition?: boolean
  medication?: boolean
  boneJoint?: boolean
  supervisedOnly?: boolean
  /** Ill in the last two weeks (a cold, a virus), which delays the first hard week. */
  recentIllness?: boolean
  notes?: string
}

export type BodyArea =
  | 'foot'
  | 'ankle'
  | 'achilles'
  | 'calf'
  | 'shin'
  | 'knee'
  | 'hamstring'
  | 'quad'
  | 'hip'
  | 'groin'
  | 'lower back'
  | 'upper back'
  | 'neck'
  | 'shoulder'
  | 'elbow'
  | 'wrist'
  | 'rib'
  | 'other'

export type Aggravator = 'running' | 'cycling' | 'swimming' | 'rowing' | 'lifting' | 'impact' | 'hills' | 'speed work' | 'long sessions' | 'sitting'

export type InjuryStatus = 'current' | 'recovering' | 'past'

export interface Injury {
  id: string
  area: BodyArea
  side?: 'left' | 'right' | 'both'
  description?: string
  /** When it started (YYYY-MM-DD), roughly. */
  since?: string
  status: InjuryStatus
  /** 0–10 pain today, at rest and during the sport that hurts most. */
  painNow?: number
  painInSport?: number
  worsening?: boolean
  painAtRest?: boolean
  nightPain?: boolean
  /** Swelling, numbness, tingling, giving way or locking. */
  otherSymptoms?: boolean
  aggravatedBy: Aggravator[]
  seenBy?: 'nobody' | 'physio' | 'doctor' | 'other'
  /** Cleared to train fully by whoever saw it. */
  cleared?: boolean
  /** What the physio said to do or avoid. */
  advice?: string
  updatedAt: string
}

export interface Availability {
  /** Most days a week with training on them. */
  daysPerWeek?: number
  /** Most training hours a week. */
  hoursPerWeek?: number
  /** Longest session that fits on a work day and on a day off, in minutes. */
  weekdayMaxMin?: number
  dayOffMaxMin?: number
  /** Two sessions in a day are fine. */
  doubles?: boolean
  /** JS weekday (0 = Sunday) kept free. */
  restDay?: number
  notes?: string
}

export type Equipment =
  | 'road bike'
  | 'TT bike'
  | 'turbo trainer'
  | 'smart trainer'
  | 'power meter'
  | 'HR strap'
  | 'GPS watch'
  | 'treadmill'
  | 'rowing machine'
  | 'gym'
  | 'pool'
  | 'open water'
  | 'track'

/** Other training to keep up alongside the goal, e.g. rowing twice a week. */
export interface KeepSport {
  sport: Sport
  sessions: number
}

export type SwimLevel = 'none' | 'learning' | 'continuous' | 'confident'

export interface AthleteProfile {
  goal: Goal
  health: HealthScreen
  injuries: Injury[]
  /** Confirmed that the list is complete (including "no injuries"). */
  injuriesChecked?: boolean
  /** Training the log doesn't show (a club, a gap, a break), confirmed alongside the summary. */
  historyNotes?: string
  /** True once the summary from the log has been checked. */
  historyChecked?: boolean
  /** Years of regular endurance training. */
  trainingYears?: number
  swimLevel?: SwimLevel
  availability: Availability
  equipment: Equipment[]
  keep: KeepSport[]
  /** Anything else the coach should know: likes, dislikes, club sessions. */
  notes?: string
  updatedAt: string
}

export const EMPTY_PROFILE: AthleteProfile = {
  goal: { legs: [] },
  health: {},
  injuries: [],
  availability: {},
  equipment: [],
  keep: [],
  updatedAt: '',
}
