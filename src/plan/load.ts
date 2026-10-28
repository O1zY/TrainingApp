import { addDays, clockMin } from './dates'
import type { Commitment, Demand, PlanPrefs } from './types'

/**
 * What an hour of each kind of work adds to the day, in the same arbitrary units as
 * session load (RPE × minutes) but heavily scaled down: a full shift on your feet is about
 * a steady 45′, a full heavy shift about an hour of hard training. A starting point,
 * like the target thresholds, for the later coaching feature to learn from.
 */
export const DEMANDS: Record<Demand, { label: string; hint: string; perHour: number }> = {
  desk: { label: 'Desk', hint: 'Sitting most of the shift', perHour: 5 },
  feet: { label: 'On feet', hint: 'Standing and walking: retail, bar, serving', perHour: 15 },
  physical: { label: 'Physical', hint: 'Lifting and carrying: shelf-stacking, deliveries', perHour: 25 },
  heavy: { label: 'Heavy', hint: 'Hard manual work most of the shift', perHour: 35 },
}

export const DEMAND_OPTIONS = (Object.keys(DEMANDS) as Demand[]).map((value) => ({ value, label: DEMANDS[value].label }))

export type Strain = 'low' | 'medium' | 'high'

export interface DayLoad {
  date: string
  commitments: Commitment[]
  workMin: number
  /** Work load in session-load units. */
  load: number
  /** Work starts before 07:00. */
  early: boolean
  /** Work ends after 21:00. */
  late: boolean
  /** A shift runs past midnight into or out of this day. */
  night: boolean
  /** Ten hours or more of work. */
  long: boolean
  /** Time taken up, in minutes after midnight, with the commute either side of work. */
  busy: [number, number][]
  /** Gaps of 20′ or more inside the training day window. */
  free: [number, number][]
  freeMin: number
  /** First work start and last work finish, for before/after-work timing. */
  workStart?: number
  workEnd?: number
  /** Load plus penalties for early starts, late and night shifts: ranks days for hard sessions. */
  score: number
  strain: Strain
}

function shiftMin(c: Commitment) {
  const s = clockMin(c.start)
  const e = clockMin(c.end)
  return e > s ? e - s : e + 1440 - s
}

export function commitmentLoad(c: Commitment) {
  return c.kind === 'work' ? Math.round((shiftMin(c) / 60) * DEMANDS[c.demand ?? 'feet'].perHour) : 0
}

export function dayLoad(date: string, all: Commitment[], prefs: PlanPrefs): DayLoad {
  const today = all.filter((c) => c.date === date)
  const yesterday = addDays(date, -1)
  // A night shift from yesterday still has hold of the morning.
  const carried = all.filter((c) => c.date === yesterday && clockMin(c.end) <= clockMin(c.start))

  const busy: [number, number][] = []
  let workStart: number | undefined
  let workEnd: number | undefined
  const pad = (c: Commitment) => (c.kind === 'work' ? prefs.commuteMin : 0)

  for (const c of today) {
    const s = clockMin(c.start)
    const e = clockMin(c.end)
    const end = e > s ? e : 1440
    busy.push([s - pad(c), end + (e > s ? pad(c) : 0)])
    if (c.kind === 'work') {
      workStart = Math.min(workStart ?? s, s)
      workEnd = Math.max(workEnd ?? end, end)
    }
  }
  for (const c of carried) {
    const e = clockMin(c.end)
    busy.push([0, e + pad(c)])
    if (c.kind === 'work') workEnd = Math.max(workEnd ?? e, e)
  }

  const work = today.filter((c) => c.kind === 'work')
  const workMin = work.reduce((a, c) => a + shiftMin(c), 0)
  const load = work.reduce((a, c) => a + commitmentLoad(c), 0)
  const early = work.some((c) => clockMin(c.start) < 7 * 60)
  const night = work.some((c) => clockMin(c.end) <= clockMin(c.start)) || carried.some((c) => c.kind === 'work')
  const late = night || work.some((c) => clockMin(c.end) > 21 * 60)
  const long = workMin >= 600

  const free = freeWindows(clockMin(prefs.dayStart), clockMin(prefs.dayEnd), busy)
  const score = load + (early ? 25 : 0) + (late ? 25 : 0) + (night ? 80 : 0) + (long ? 30 : 0)

  return {
    date,
    commitments: [...carried, ...today],
    workMin,
    load,
    early,
    late,
    night,
    long,
    busy,
    free,
    freeMin: free.reduce((a, [s, e]) => a + e - s, 0),
    workStart,
    workEnd,
    score,
    strain: score < 60 ? 'low' : score < 160 ? 'medium' : 'high',
  }
}

function freeWindows(from: number, to: number, busy: [number, number][]) {
  const sorted = [...busy].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  let cursor = from
  for (const [s, e] of sorted) {
    if (s > cursor) out.push([cursor, Math.min(s, to)])
    cursor = Math.max(cursor, e)
    if (cursor >= to) break
  }
  if (cursor < to) out.push([cursor, to])
  return out.filter(([s, e]) => e - s >= 20)
}

export function weekWork(days: DayLoad[]) {
  return { hours: days.reduce((a, d) => a + d.workMin, 0) / 60, load: days.reduce((a, d) => a + d.load, 0) }
}

export const STRAIN_LABEL: Record<Strain, string> = { low: 'Light day', medium: 'Moderate day', high: 'Hard day' }

export function describeDay(d: DayLoad) {
  if (!d.workMin) return d.commitments.length ? 'Busy, no work' : 'Day off'
  const flags = [d.night && 'night shift', !d.night && d.early && 'early start', !d.night && d.late && 'late finish', d.long && 'long shift'].filter(Boolean)
  return [`${Math.round((d.workMin / 60) * 10) / 10}h work`, ...flags].join(' · ')
}
