// The morning check: after the day's check-in, if a hard session is planned and the night
// or HRV says the body isn't ready, offer to swap it for an easy one and move the hard one
// later in the week. Always asked, never done silently.

import { newId } from '../log/format'
import type { Session, Wellbeing } from '../log/types'
import { addDays, weekDates, weekStart } from '../plan/dates'
import { buildOneOff, estimateSec, specsFor } from '../plan/oneOffs'
import type { Block, DayCheck, PlanEvent, PlannedSession } from '../plan/types'

export const SHORT_SLEEP_H = 6

const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length
const sd = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1))
}

export interface HrvStatus {
  /** Average of the readings in the 7 days to today. */
  week: number
  /** Normal range: the 28 days before, mean ± 0.5 SD. */
  low: number
  high: number
  below: boolean
}

/**
 * HRV against its normal range, the way the HRV-guided trials did it (Javaloyes et al., as
 * tabled in Manresa-Rocamora et al. 2021): the 7-day average set against the mean ± half a
 * standard deviation of the 28 days before. Needs 3+ readings this week and 14+ before.
 */
export function hrvStatus(wellbeing: Wellbeing[], today: string): HrvStatus | undefined {
  const vals = (from: string, to: string) => wellbeing.filter((w) => w.hrv != null && w.date >= from && w.date <= to).map((w) => w.hrv!)
  const week = vals(addDays(today, -6), today)
  const base = vals(addDays(today, -34), addDays(today, -7))
  if (week.length < 3 || base.length < 14) return undefined
  const m = mean(base)
  const half = sd(base) / 2
  const avg = mean(week)
  return { week: avg, low: m - half, high: m + half, below: avg < m - half }
}

export interface MorningCheck {
  session: PlannedSession
  reasons: string[]
  findings: string[]
}

/** Today's hard session, if today's check-in says swap it. Undefined when there's nothing to ask. */
export function morningCheck(input: { today: string; planned: PlannedSession[]; sessions: Session[]; wellbeing: Wellbeing[]; dayChecks: DayCheck[] }): MorningCheck | undefined {
  const { today, planned, sessions, wellbeing, dayChecks } = input
  if (dayChecks.some((c) => c.date === today)) return undefined
  const checkin = wellbeing.find((w) => w.date === today)
  if (!checkin) return undefined
  const logged = new Set(sessions.map((s) => s.planId).filter(Boolean))
  const session = planned.find((p) => p.date === today && p.intensity === 'key' && !p.skipped && !logged.has(p.id))
  if (!session) return undefined

  const reasons: string[] = []
  const findings = new Set<string>()
  if (checkin.sleepHours != null && checkin.sleepHours < SHORT_SLEEP_H) {
    reasons.push(`${checkin.sleepHours}h sleep`)
    findings.add('sleep')
  }
  if (checkin.sleepQuality != null && checkin.sleepQuality <= 2) {
    reasons.push('poor sleep')
    findings.add('sleep')
  }
  const hrv = hrvStatus(wellbeing, today)
  if (hrv?.below) {
    reasons.push(`HRV below normal (7-day ${Math.round(hrv.week)}ms, normal ${Math.round(hrv.low)}–${Math.round(hrv.high)}ms)`)
    findings.add('hrv-guided')
  }
  return reasons.length ? { session, reasons, findings: [...findings] } : undefined
}

export interface Swap {
  /** Today's session, now an easy one. */
  easy: PlannedSession
  /** The hard session on its new day, if one fits this week. */
  moved?: PlannedSession
}

/**
 * Today's hard session becomes an easy one in the same sport, and the hard one goes to the
 * first later day this week with no hard session that day or either side, no session in the
 * same sport, and no race the day after. Both are locked so re-planning leaves them be.
 */
export function swapPlan(input: { today: string; session: PlannedSession; planned: PlannedSession[]; events: PlanEvent[]; block?: Block; weekStartsOn: 0 | 1 }): Swap {
  const { today, session, planned, events, block, weekStartsOn } = input
  const easyMin = block?.sports.find((s) => s.sport === session.sport)?.easyMin ?? 40
  const oneOff = buildOneOff(session.sport, specsFor(session.sport, 'easy')[0], Math.min(easyMin, Math.round((session.durationSec ?? 2700) / 60)), 1)
  const easy: PlannedSession = {
    ...session,
    intensity: 'easy',
    title: oneOff.name,
    workoutId: undefined,
    oneOff,
    benchmark: undefined,
    durationSec: estimateSec(oneOff),
    locked: true,
    notes: [session.notes, `Swapped from ${session.title} after the morning check.`].filter(Boolean).join(' '),
  }

  const others = planned.filter((p) => p.id !== session.id)
  const hardOn = (d: string) => others.some((p) => p.date === d && (p.intensity === 'key' || p.intensity === 'race'))
  const raceOn = (d: string) => events.some((e) => e.kind === 'race' && e.date === d)
  const day = weekDates(weekStart(today, weekStartsOn)).find(
    (d) => d > today && !hardOn(d) && !hardOn(addDays(d, -1)) && !hardOn(addDays(d, 1)) && !raceOn(d) && !raceOn(addDays(d, 1)) && !others.some((p) => p.date === d && p.sport === session.sport),
  )
  const moved = day ? { ...session, id: newId(), date: day, time: undefined, slot: undefined, reason: 'Moved from a morning check', locked: true } : undefined
  return { easy, moved }
}
