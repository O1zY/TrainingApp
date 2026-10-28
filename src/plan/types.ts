// Data model for programmes: blocks of weeks, the sessions planned in them, races and
// events, and the work shifts and commitments the plan has to fit around.

import type { MultisportKind, Sport, Workout } from '../log/types'

/**
 * Where a week sits in the cycle. The default rhythm is three build weeks then a deload;
 * races bring taper, race and recovery weeks, which restart the rhythm afterwards.
 */
export type WeekKind = 'build' | 'deload' | 'taper' | 'race' | 'recovery'

export type Intensity = 'easy' | 'moderate' | 'key' | 'race'

/** A sport's share of each training week in a block. */
export interface BlockSport {
  sport: Sport
  /** Sessions per normal build week. */
  sessions: number
  /** How many of those are hard (intervals, tests, heavy lifting). */
  key: number
  /** Length of an easy session at the start of the block; grows through the build weeks. */
  easyMin: number
  /** One easy session a week is the long one (about 1.5× easy length). */
  long: boolean
}

export interface Block {
  id: string
  name: string
  goal?: string
  /** First day of the first week (YYYY-MM-DD). */
  start: string
  weeks: number
  /** Build weeks before each deload: 3 gives the standard 3:1. */
  buildWeeks: number
  /** Volume added per build week, as a %: 8 gives 100%, 108%, 116%. */
  progressionPct: number
  /** Deload volume as a % of the first build week. */
  deloadPct: number
  sports: BlockSport[]
  /** Most days a week with training on them (recovery work doesn't count). */
  maxDays: number
  /** Two sessions on one day when the week needs it. */
  doubles: boolean
  /** JS weekday (0 = Sunday) kept free when possible. */
  restDay?: number
  /** Library workouts repeated once per cycle, in the same build week, so attempts compare. */
  benchmarks: string[]
  /** 0–100: share of the other sessions taken from the library rather than one-offs. */
  libraryMix: number
  /** Hand-set week kinds, keyed by week start date. */
  weekKinds?: Record<string, WeekKind>
  createdAt: string
  updatedAt: string
}

/** A session written for this plan only. Same shape as a library workout, so it can be saved there. */
export type OneOff = Omit<Workout, 'id' | 'createdAt' | 'updatedAt'>

export interface PlannedSession {
  id: string
  blockId?: string
  date: string
  /** Suggested start (HH:MM) from the free time around commitments. */
  time?: string
  /** Relative to work that day, when there is any. */
  slot?: 'before' | 'after' | 'off'
  sport: Sport
  intensity: Intensity
  title: string
  /** Library workout to do. */
  workoutId?: string
  /** Or a one-off written by the planner (or by hand). */
  oneOff?: OneOff
  /** Repeats each cycle so results can be compared. */
  benchmark?: boolean
  /** Race or event this session is for. */
  eventId?: string
  /** Planned length, including rest and warm-up where it's an estimate. */
  durationSec?: number
  notes?: string
  /** Why the planner put it on this day, e.g. "Day off work". */
  reason?: string
  /** Edited, moved or added by hand: re-planning leaves it alone. */
  locked?: boolean
  skipped?: boolean
}

export type EventKind = 'race' | 'away' | 'busy'
export type RacePriority = 'A' | 'B' | 'C'

/** Races and life events the plan bends around. */
export interface PlanEvent {
  id: string
  kind: EventKind
  name: string
  date: string
  /** Last day, for multi-day events (holidays, busy spells). */
  endDate?: string
  /** A: taper and recovery weeks. B: lighter race week. C: trained through. */
  priority?: RacePriority
  sport?: Sport
  multisport?: MultisportKind
  notes?: string
}

/** How physically demanding a job is, which sets how much it adds to the week's load. */
export type Demand = 'desk' | 'feet' | 'physical' | 'heavy'

/** A work shift or other fixed commitment. `end` before `start` runs past midnight. */
export interface Commitment {
  id: string
  date: string
  start: string
  end: string
  kind: 'work' | 'busy'
  demand?: Demand
  title?: string
  source: 'manual' | 'google' | 'ics'
  externalId?: string
}

export interface PlanPrefs {
  /** Added each side of a work shift. */
  commuteMin: number
  /** Training day window: nothing is suggested earlier or later than this. */
  dayStart: string
  dayEnd: string
  /** Applied to imported events picked out as work. */
  defaultDemand: Demand
  /** Imported events whose title contains one of these count as work, the rest as busy time. */
  workKeywords: string[]
  /** Google calendars to read. */
  calendarIds: string[]
  lastSync?: string
}
