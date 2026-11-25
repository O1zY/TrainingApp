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

/** One reason the coach gave for a block (see src/coach/rules.ts). */
export interface CoachNote {
  area: string
  text: string
  /** Research finding ids. */
  findings: string[]
  judgement?: boolean
}

export interface CoachNotes {
  at: string
  notes: CoachNote[]
  warnings: string[]
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
  /**
   * Volume added each cycle, as a %: 5 makes every week of the second cycle 5% bigger
   * than the same week of the first. Missing or 0 repeats the same cycle.
   */
  cycleGrowthPct?: number
  sports: BlockSport[]
  /** Most days a week with training on them (recovery work doesn't count). */
  maxDays: number
  /** Two sessions on one day when the week needs it. */
  doubles: boolean
  /** JS weekday (0 = Sunday) kept free when possible. */
  restDay?: number
  /**
   * Sports tested in turn, one per deload week, so each fitness marker stays current.
   * Missing: the block's main sport every time.
   */
  testSports?: Sport[]
  /**
   * Bricks a week: a brick uses up one session in each sport it covers, so a bike–run brick
   * replaces a bike session and a run session. Build weeks get this many, taper weeks a short one,
   * deload, race and recovery weeks none. Missing: none.
   */
  bricksPerWeek?: number
  /** Library workouts repeated once per cycle, in the same build week, so attempts compare. */
  benchmarks: string[]
  /** 0–100: share of the other sessions taken from the library rather than one-offs. */
  libraryMix: number
  /** Hand-set week kinds, keyed by week start date. */
  weekKinds?: Record<string, WeekKind>
  /** Changes accepted from a weekly review, keyed by week start date. */
  weekAdjust?: Record<string, WeekAdjust>
  /** Set when the coach built this block: why each choice was made, and from which research. */
  coach?: CoachNotes
  createdAt: string
  updatedAt: string
}

/** A change to one week of a block, from a weekly review. Changes to the same week combine. */
export interface WeekAdjust {
  /** The week's volume as a % of what the cycle gives it (100 = as planned). */
  scale?: number
  /** No hard sessions (and no test) this week. */
  easyOnly?: boolean
  /** Sports cut back this week: half the sessions, none of them hard. */
  less?: Sport[]
  /** Sports left out this week. */
  drop?: Sport[]
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
  /** Sports of a brick's legs, in order. Set when the session is a brick; `sport` is then the first leg's. */
  legSports?: Sport[]
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
  /** Travel to work, each way. */
  commuteMin: number
  /**
   * Gap kept between training and travel, either side of a shift: to shower and refuel
   * after a session before leaving, and to eat and settle after getting home before training.
   */
  gapMin: number
  /** Asked when building a block; until then the defaults are assumed. */
  workdaySet?: boolean
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
  /** The app's own Google calendar the plan is written to, once made. */
  pushCalendarId?: string
  /** When the plan was last written out. */
  lastPush?: string
  /** Write changes out automatically while Google access is live in this tab. */
  autoPush?: boolean
}

// ---- Weekly review (section 13) -------------------------------------------------

/** What accepting a proposal changes. Advice-only proposals have none. */
export type ReviewChange =
  | { kind: 'adjustWeek'; week: string; adjust: WeekAdjust }
  | { kind: 'weekKind'; week: string; to: WeekKind }
  /** Gives planned session `toId` the content of missed session `fromId`. */
  | { kind: 'moveSession'; fromId: string; toId: string }

export type ReviewRule = 'missed-key' | 'low-completion' | 'struggling' | 'ill' | 'niggle' | 'targets-easy' | 'targets-hard' | 'work'

export interface ReviewProposal {
  /** Stable within a review: the rule plus what it's about. */
  id: string
  rule: ReviewRule
  title: string
  reason: string
  /** Research finding ids (src/coach/evidence). */
  findings: string[]
  judgement?: boolean
  change?: ReviewChange
  /** Where to go for an advice-only proposal, e.g. the fitness markers page. */
  link?: { to: string; label: string }
}

/** The numbers a review showed, kept so the reasoning stays visible later. */
export interface ReviewSnapshot {
  planned: number
  done: number
  missed: number
  skipped: number
  moved: number
  plannedSec: number
  doneSec: number
  keyDue: number
  keyDone: number
  load: number
  fitness: number
  fatigue: number
  checkins: number
  lowDays: number
}

export interface WeeklyReview {
  id: string
  /** First day of the week reviewed. */
  weekStart: string
  blockId?: string
  status: 'done' | 'skipped'
  /** 1 (awful) – 5 (great). */
  felt?: number
  /** Injury in the coach profile this review added or updated. */
  injuryId?: string
  note?: string
  snapshot?: ReviewSnapshot
  proposals: ReviewProposal[]
  /** Ids of the proposals accepted. */
  accepted: string[]
  createdAt: string
  updatedAt: string
}

/** The morning check's answer for a day, so it's asked once. Keyed by date for sync. */
export interface DayCheck {
  date: string
  choice: 'swapped' | 'kept'
  reasons: string[]
  updatedAt: string
}
