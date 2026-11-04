import { sessionLoad } from '../log/stats'
import type { Session } from '../log/types'
import { addDays } from '../plan/dates'
import { commitmentLoad } from '../plan/load'
import type { Commitment } from '../plan/types'
import { GROUPS, groupOf, inWeek, mean, type Group } from './series'

// Training load over time: session-RPE load (Foster) per day, smoothed into a
// 7-day "acute" and 28-day "chronic" exponentially weighted average (Williams et al. 2017),
// their ratio, and Foster's monotony and strain for the latest week.

export interface DayPoint {
  date: string
  load: number
  /** Exponentially weighted daily averages. */
  acute: number
  chronic: number
  /** Acute ÷ chronic, once there are 28 days of history. */
  ratio?: number
}

const ACUTE = 2 / (7 + 1)
const CHRONIC = 2 / (28 + 1)

export function loadSeries(sessions: Session[], from: string, to: string): DayPoint[] {
  const daily = new Map<string, number>()
  for (const s of sessions) daily.set(s.date, (daily.get(s.date) ?? 0) + (sessionLoad(s) ?? 0))
  const first = [...daily.keys()].sort()[0]
  if (!first || first > to) return []
  // Start the averages from the first session (or 8 weeks back) so the range opens warmed up.
  const start = first < addDays(from, -56) ? addDays(from, -56) : first
  const out: DayPoint[] = []
  let acute = 0
  let chronic = 0
  for (let d = start, i = 0; d <= to; d = addDays(d, 1), i++) {
    const load = daily.get(d) ?? 0
    acute = acute + ACUTE * (load - acute)
    chronic = chronic + CHRONIC * (load - chronic)
    if (d >= from) out.push({ date: d, load, acute, chronic, ratio: i >= 27 && chronic > 0 ? acute / chronic : undefined })
  }
  return out
}

/** Foster: mean ÷ SD of the last 7 days' load; strain = week load × monotony. */
export function monotony(days: DayPoint[]) {
  const week = days.slice(-7).map((d) => d.load)
  if (week.length < 7) return {}
  const m = mean(week)!
  const sd = Math.sqrt(week.reduce((a, x) => a + (x - m) ** 2, 0) / week.length)
  const total = week.reduce((a, b) => a + b, 0)
  if (!sd) return { total }
  return { total, monotony: m / sd, strain: total * (m / sd) }
}

export type RatioBand = 'low' | 'steady' | 'high' | 'spike'

/** A guide, not a rule: the ratio's link to injury is debated, so it's shown as a nudge. */
export function ratioBand(r: number): RatioBand {
  return r < 0.8 ? 'low' : r <= 1.3 ? 'steady' : r <= 1.5 ? 'high' : 'spike'
}

export const RATIO_LABEL: Record<RatioBand, { label: string; hint: string }> = {
  low: { label: 'Easing off', hint: 'This week is lighter than your recent norm' },
  steady: { label: 'Steady build', hint: 'In line with what you’ve been doing' },
  high: { label: 'Ramping fast', hint: 'Noticeably more than your recent norm' },
  spike: { label: 'Load spike', hint: 'A big jump on your recent norm: watch recovery' },
}

export interface WeekTotals {
  start: string
  sec: Partial<Record<Group, number>>
  distM: Partial<Record<Group, number>>
  load: number
  sessions: number
  /** Work load from shifts in the plan, same units. */
  workLoad: number
  workHours: number
}

export function weeklyTotals(sessions: Session[], commitments: Commitment[], weeks: string[]): WeekTotals[] {
  return weeks.map((start) => {
    const week = sessions.filter((s) => inWeek(s.date, start))
    const sec: WeekTotals['sec'] = {}
    const distM: WeekTotals['distM'] = {}
    for (const s of week) {
      const g = groupOf(s.sport)!
      sec[g] = (sec[g] ?? 0) + (s.durationSec ?? 0)
      if (s.distanceM) distM[g] = (distM[g] ?? 0) + s.distanceM
    }
    const work = commitments.filter((c) => c.kind === 'work' && inWeek(c.date, start))
    const workMin = work.reduce((a, c) => {
      const [sh, sm] = c.start.split(':').map(Number)
      const [eh, em] = c.end.split(':').map(Number)
      const m = eh * 60 + em - (sh * 60 + sm)
      return a + (m > 0 ? m : m + 1440)
    }, 0)
    return {
      start,
      sec,
      distM,
      load: week.reduce((a, s) => a + (sessionLoad(s) ?? 0), 0),
      sessions: week.length,
      workLoad: work.reduce((a, c) => a + commitmentLoad(c), 0),
      workHours: workMin / 60,
    }
  })
}

/** Groups that appear in any of the weeks, in stacking order. */
export const groupsPresent = (weeks: WeekTotals[]) => GROUPS.filter((g) => weeks.some((w) => w.sec[g.key]))
