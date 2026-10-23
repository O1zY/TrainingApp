import { clockToSec, ergWatts, estimate1Rm, paceValue, type PaceKind } from './format'
import type { ExerciseEntry, OneRepMax, Piece, Session, Wellbeing } from './types'

/** Session-RPE training load (Foster): RPE × minutes. */
export function sessionLoad(s: Pick<Session, 'rpe' | 'durationSec'>): number | undefined {
  if (!s.rpe || !s.durationSec) return undefined
  return Math.round(s.rpe * (s.durationSec / 60))
}

export interface PieceSummary {
  count: number
  distM: number
  sec: number
  restSec: number
  avgPace?: number
  avgRate?: number
  avgWatts?: number
  avgHr?: number
  maxHr?: number
  /** Index of the fastest piece by pace, when pieces are comparable. */
  fastest?: number
}

const mean = (xs: (number | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined
}

export function pieceWatts(p: Piece, sport: Session['sport']) {
  if (p.watts) return p.watts
  if (sport === 'erg') return ergWatts(paceValue('split500', p.distanceM, p.durationSec))
  return undefined
}

export function summarisePieces(pieces: Piece[], sport: Session['sport'], kind?: PaceKind): PieceSummary {
  const distM = pieces.reduce((a, p) => a + (p.distanceM ?? 0), 0)
  const sec = pieces.reduce((a, p) => a + (p.durationSec ?? 0), 0)
  // Rest after the last piece isn't part of the set.
  const restSec = pieces.slice(0, -1).reduce((a, p) => a + (p.restSec ?? 0), 0)
  const timed = pieces.filter((p) => p.distanceM && p.durationSec)
  const avgPace = kind && timed.length ? paceValue(kind, timed.reduce((a, p) => a + p.distanceM!, 0), timed.reduce((a, p) => a + p.durationSec!, 0)) : undefined

  let fastest: number | undefined
  if (kind && timed.length > 1) {
    const paces = pieces.map((p) => paceValue(kind, p.distanceM, p.durationSec))
    const speed = kind === 'speedKmh' || kind === 'speedMph'
    paces.forEach((v, i) => {
      if (v == null) return
      if (fastest == null || (speed ? v > paces[fastest]! : v < paces[fastest]!)) fastest = i
    })
  }

  const hrMaxes = pieces.map((p) => p.hrMax).filter((x): x is number => x != null)
  return {
    count: pieces.length,
    distM,
    sec,
    restSec,
    avgPace,
    avgRate: mean(pieces.map((p) => p.rate)),
    avgWatts: mean(pieces.map((p) => pieceWatts(p, sport))),
    avgHr: mean(pieces.map((p) => p.hrAvg)),
    maxHr: hrMaxes.length ? Math.max(...hrMaxes) : undefined,
    fastest,
  }
}

export function exerciseStats(e: ExerciseEntry) {
  const work = e.sets.filter((s) => !s.warmup)
  const volumeKg = work.reduce((a, s) => a + (s.reps ?? 0) * (s.weightKg ?? 0), 0)
  const reps = work.reduce((a, s) => a + (s.reps ?? 0), 0)
  const top = work.reduce<number | undefined>((a, s) => (s.weightKg != null && (a == null || s.weightKg > a) ? s.weightKg : a), undefined)
  const e1rm = work.reduce<number | undefined>((a, s) => {
    const est = estimate1Rm(s.weightKg, s.reps)
    return est != null && (a == null || est > a) ? est : a
  }, undefined)
  return { sets: work.length, reps, volumeKg, top, e1rm }
}

export interface TimelineItem {
  kind: 'leg' | 'gap'
  session?: Session
  /** For legs: the leg's duration. For gaps: worked-out transition time. */
  sec?: number
  startSec?: number
  label: string
}

/**
 * Orders legs and fills the transitions. A 'transition' leg is used as-is; where
 * two moving legs sit next to each other, the gap between the first finishing and
 * the next starting is shown as a worked-out transition.
 */
export function multisportTimeline(legs: Session[]) {
  const items: TimelineItem[] = []
  let tCount = 0
  legs.forEach((leg, i) => {
    const prev = legs[i - 1]
    if (prev && prev.sport !== 'transition' && leg.sport !== 'transition') {
      const prevStart = clockToSec(prev.startTime)
      const start = clockToSec(leg.startTime)
      const gap = prevStart != null && start != null && prev.durationSec != null ? start - (prevStart + prev.durationSec) : undefined
      tCount++
      items.push({ kind: 'gap', sec: gap != null && gap >= 0 ? gap : undefined, startSec: prevStart != null && prev.durationSec != null ? prevStart + prev.durationSec : undefined, label: `T${tCount}` })
    }
    if (leg.sport === 'transition') tCount++
    items.push({ kind: 'leg', session: leg, sec: leg.durationSec, startSec: clockToSec(leg.startTime), label: leg.sport === 'transition' ? `T${tCount}` : '' })
  })

  const first = clockToSec(legs[0]?.startTime)
  const lastLeg = legs[legs.length - 1]
  const lastStart = clockToSec(lastLeg?.startTime)
  const byClock = first != null && lastStart != null && lastLeg?.durationSec != null ? lastStart + lastLeg.durationSec - first : undefined
  const summed = items.every((i) => i.sec != null) ? items.reduce((a, i) => a + (i.sec ?? 0), 0) : undefined
  const transitionSec = items
    .filter((i) => i.kind === 'gap' || i.session?.sport === 'transition')
    .reduce<number | undefined>((a, i) => (i.sec == null ? a : (a ?? 0) + i.sec), undefined)

  return { items, totalSec: byClock ?? summed, transitionSec }
}

/** Newest first: by date, then start time, then when it was logged. */
export function sortSessions(list: Session[]) {
  return [...list].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.startTime ?? '').localeCompare(a.startTime ?? '') || b.createdAt.localeCompare(a.createdAt),
  )
}

export function findMax(maxes: OneRepMax[], exercise: string) {
  const key = exercise.trim().toLowerCase()
  return key ? maxes.find((m) => m.exercise.toLowerCase() === key) : undefined
}

/** Wellbeing scales where 5 is good, and ones where 1 = none (flipped for the score). */
export const WELLBEING_GOOD = ['sleepQuality', 'energy', 'mood', 'motivation'] as const
export const WELLBEING_BAD = ['soreness', 'fatigue', 'stress'] as const

/** Mean of the 1–5 scales with soreness, fatigue and stress flipped, so 5 is always good. */
export function wellnessScore(w: Partial<Wellbeing>): number | undefined {
  const vals = [...WELLBEING_GOOD.map((k) => w[k]), ...WELLBEING_BAD.map((k) => (w[k] == null ? undefined : 6 - w[k]))].filter((v): v is number => v != null)
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : undefined
}
