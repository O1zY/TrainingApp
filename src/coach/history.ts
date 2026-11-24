import { counted, loadSeries, missingRpe } from '../analysis/load'
import type { Session, Sport, Wellbeing } from '../log/types'
import { addDays, clockMin, weekStart, weekday } from '../plan/dates'
import { dayLoad } from '../plan/load'
import type { Commitment, PlanPrefs } from '../plan/types'

// What the app already knows about the athlete, worked out so the screening doesn't ask
// for it: recent training (from the log and Strava imports) and the work pattern (from
// shifts). Shown on the screening page to be checked, and later sent to the coach.

export interface SportHistory {
  sport: Sport
  sessions: number
  sessionsPerWeek: number
  hoursPerWeek: number
  /** Distance per week, for sports that log distance. */
  kmPerWeek?: number
  longestSec?: number
  longestM?: number
  lastDate: string
}

export interface TrainingHistory {
  from: string
  to: string
  weeks: number
  /** First session ever logged, to say how far back the data goes. */
  firstLog?: string
  /** Weeks in the range with at least one session. */
  activeWeeks: number
  hoursPerWeek: number
  /** The same over the last four weeks of the range, to show the direction. */
  recentHoursPerWeek: number
  maxWeekHours: number
  daysPerWeek: number
  sports: SportHistory[]
  /** Run–bike or other multisport sessions (bricks, races). */
  multisport: number
  /** Today's fitness (42-day), fatigue (7-day) and their ratio, from session RPE. */
  load?: { fitness: number; fatigue: number; form: number; ratio?: number }
  /** Sessions with no RPE, which the load leaves out. */
  missingRpe: number
  /** Sessions tagged Niggle or Sore, and check-ins naming an injury. */
  niggleSessions: number
  injuryNotes: string[]
  /** Check-ins marked ill in the last 14 days. */
  recentIllDays: number
  checkins?: { count: number; sleepHours?: number; restingHr?: number; hrv?: number }
}

const avg = (xs: (number | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined
}

/**
 * The last `weeks` whole weeks before the current one, so a half-done week doesn't
 * drag the averages down.
 */
export function trainingHistory(sessions: Session[], wellbeing: Wellbeing[], today: string, weekStartsOn: 0 | 1, weeks = 12): TrainingHistory {
  const to = addDays(weekStart(today, weekStartsOn), -1)
  const from = addDays(to, -7 * weeks + 1)
  const done = sessions.filter(counted)
  const inRange = done.filter((s) => s.date >= from && s.date <= to)
  const weekOf = (d: string) => weekStart(d, weekStartsOn)

  const weekHours = new Map<string, number>()
  const days = new Set<string>()
  for (const s of inRange) {
    days.add(s.date)
    weekHours.set(weekOf(s.date), (weekHours.get(weekOf(s.date)) ?? 0) + (s.durationSec ?? 0) / 3600)
  }
  const total = [...weekHours.values()].reduce((a, b) => a + b, 0)
  const recentFrom = addDays(to, -27)
  const recent = inRange.filter((s) => s.date >= recentFrom).reduce((a, s) => a + (s.durationSec ?? 0) / 3600, 0)

  const bySport = new Map<Sport, Session[]>()
  for (const s of inRange) bySport.set(s.sport, [...(bySport.get(s.sport) ?? []), s])
  const sports: SportHistory[] = [...bySport.entries()]
    .map(([sport, list]) => {
      const hours = list.reduce((a, s) => a + (s.durationSec ?? 0), 0) / 3600
      const metres = list.reduce((a, s) => a + (s.distanceM ?? 0), 0)
      const longest = list.reduce<Session | undefined>((best, s) => ((s.durationSec ?? 0) > (best?.durationSec ?? 0) ? s : best), undefined)
      const furthest = Math.max(0, ...list.map((s) => s.distanceM ?? 0))
      return {
        sport,
        sessions: list.length,
        sessionsPerWeek: list.length / weeks,
        hoursPerWeek: hours / weeks,
        kmPerWeek: metres ? metres / 1000 / weeks : undefined,
        longestSec: longest?.durationSec,
        longestM: furthest || undefined,
        lastDate: list.map((s) => s.date).sort().at(-1)!,
      }
    })
    .sort((a, b) => b.hoursPerWeek - a.hoursPerWeek || b.sessions - a.sessions)

  const series = loadSeries(done, today)
  const last = series.at(-1)
  const load = last && last.fitness > 0 ? { fitness: last.fitness, fatigue: last.fatigue, form: last.fitness - last.fatigue, ratio: last.fatigue / last.fitness } : undefined

  const checkFrom = addDays(today, -27)
  const recentChecks = wellbeing.filter((w) => w.date >= checkFrom && w.date <= today)
  const illFrom = addDays(today, -13)

  return {
    from,
    to,
    weeks,
    firstLog: done.map((s) => s.date).sort()[0],
    activeWeeks: weekHours.size,
    hoursPerWeek: total / weeks,
    recentHoursPerWeek: recent / 4,
    maxWeekHours: Math.max(0, ...weekHours.values()),
    daysPerWeek: days.size / weeks,
    sports,
    multisport: new Set(inRange.map((s) => s.multisportId).filter(Boolean)).size,
    load,
    missingRpe: missingRpe(sessions, from, to),
    niggleSessions: inRange.filter((s) => s.feel?.some((f) => f === 'Niggle' || f === 'Sore')).length,
    injuryNotes: [...new Set(wellbeing.filter((w) => w.date >= from && w.injury?.trim()).map((w) => w.injury!.trim()))],
    recentIllDays: wellbeing.filter((w) => w.date >= illFrom && w.date <= today && w.illness).length,
    checkins: recentChecks.length
      ? {
          count: recentChecks.length,
          sleepHours: avg(recentChecks.map((w) => w.sleepHours)),
          restingHr: avg(recentChecks.map((w) => w.restingHr)),
          hrv: avg(recentChecks.map((w) => w.hrv)),
        }
      : undefined,
  }
}

export interface WeekdayWork {
  /** JS weekday, 0 = Sunday. */
  day: number
  /** Share of the weeks looked at with work on this day, 0–1. */
  share: number
  /** Most common start and finish on this day. */
  start?: string
  end?: string
}

export interface WorkPattern {
  /** Looked ahead at shifts already added, or back when there are none ahead. */
  source: 'ahead' | 'past' | 'none'
  from: string
  to: string
  weeks: number
  hoursPerWeek: number
  shiftsPerWeek: number
  /** Days a week with no work at all. */
  daysOffPerWeek: number
  days: WeekdayWork[]
  earlyStarts: number
  lateFinishes: number
  nights: number
}

const mode = (xs: string[]) => {
  const n = new Map<string, number>()
  xs.forEach((x) => n.set(x, (n.get(x) ?? 0) + 1))
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
}

/** The usual working week, from the next `weeks` weeks of shifts, or the last ones if none are added yet. */
export function workPattern(commitments: Commitment[], prefs: PlanPrefs, today: string, weekStartsOn: 0 | 1, weeks = 4): WorkPattern {
  const thisWeek = weekStart(today, weekStartsOn)
  const work = commitments.filter((c) => c.kind === 'work')
  const aheadTo = addDays(thisWeek, 7 * weeks - 1)
  const hasAhead = work.some((c) => c.date >= thisWeek && c.date <= aheadTo)
  const pastFrom = addDays(thisWeek, -7 * weeks)
  const hasPast = work.some((c) => c.date >= pastFrom && c.date < thisWeek)
  const source = hasAhead ? 'ahead' : hasPast ? 'past' : 'none'
  const from = source === 'past' ? pastFrom : thisWeek
  const to = addDays(from, 7 * weeks - 1)

  const loads = Array.from({ length: 7 * weeks }, (_, i) => dayLoad(addDays(from, i), commitments, prefs))
  const worked = loads.filter((d) => d.workMin > 0)
  const shifts = work.filter((c) => c.date >= from && c.date <= to)
  const days: WeekdayWork[] = Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7).map((day) => {
    const on = shifts.filter((c) => weekday(c.date) === day)
    return {
      day,
      share: new Set(on.map((c) => c.date)).size / weeks,
      start: mode(on.map((c) => c.start)),
      end: mode(on.map((c) => c.end)),
    }
  })

  return {
    source,
    from,
    to,
    weeks,
    hoursPerWeek: worked.reduce((a, d) => a + d.workMin, 0) / 60 / weeks,
    shiftsPerWeek: shifts.length / weeks,
    daysOffPerWeek: (7 * weeks - worked.length) / weeks,
    days,
    earlyStarts: shifts.filter((c) => clockMin(c.start) < 7 * 60).length,
    lateFinishes: worked.filter((d) => d.late).length,
    nights: worked.filter((d) => d.night).length,
  }
}
