import { paceKind, paceValue, type PaceKind } from '../log/format'
import { exerciseStats, summarisePieces } from '../log/stats'
import type { OneRepMax, Session, Sport, Workout } from '../log/types'
import type { Units } from '../settings/SettingsContext'
import { inWeek, mean } from './series'

// Personal bests, lift progress, repeat attempts at library workouts and the
// aerobic trend. Everything reads completed sessions only.

// ---- Personal bests ------------------------------------------------------------

export interface PbDef {
  id: string
  sport: Sport
  label: string
  /** A set distance (best = fastest time) or a set time (best = furthest). */
  distanceM?: number
  durationSec?: number
}

export const PB_DEFS: PbDef[] = [
  { id: 'erg-500', sport: 'erg', label: '500m', distanceM: 500 },
  { id: 'erg-1k', sport: 'erg', label: '1k', distanceM: 1000 },
  { id: 'erg-2k', sport: 'erg', label: '2k', distanceM: 2000 },
  { id: 'erg-5k', sport: 'erg', label: '5k', distanceM: 5000 },
  { id: 'erg-6k', sport: 'erg', label: '6k', distanceM: 6000 },
  { id: 'erg-10k', sport: 'erg', label: '10k', distanceM: 10000 },
  { id: 'erg-30', sport: 'erg', label: '30 min', durationSec: 1800 },
  { id: 'erg-60', sport: 'erg', label: '60 min', durationSec: 3600 },
  { id: 'run-1k', sport: 'run', label: '1km', distanceM: 1000 },
  { id: 'run-mile', sport: 'run', label: 'Mile', distanceM: 1609.344 },
  { id: 'run-5k', sport: 'run', label: '5km', distanceM: 5000 },
  { id: 'run-10k', sport: 'run', label: '10km', distanceM: 10000 },
  { id: 'run-half', sport: 'run', label: 'Half marathon', distanceM: 21097.5 },
  { id: 'run-full', sport: 'run', label: 'Marathon', distanceM: 42195 },
  { id: 'bike-10k', sport: 'bike', label: '10km', distanceM: 10000 },
  { id: 'bike-40k', sport: 'bike', label: '40km', distanceM: 40000 },
  { id: 'swim-100', sport: 'swim', label: '100m', distanceM: 100 },
  { id: 'swim-400', sport: 'swim', label: '400m', distanceM: 400 },
  { id: 'swim-1500', sport: 'swim', label: '1500m', distanceM: 1500 },
]

export interface Effort {
  /** Seconds for a distance PB, metres for a time PB. */
  value: number
  date: string
  sessionId: string
  /** A rep inside a session rather than the whole session. */
  rep?: number
}

export interface Pb {
  def: PbDef
  best: Effort
  /** Each time the record was broken, oldest first (the last is `best`). */
  progression: Effort[]
}

/** Erg and pool distances are exact; GPS run and ride distances are allowed 2% over. */
const slack = (sport: Sport) => (sport === 'run' || sport === 'bike' ? 0.02 : 0.005)

function matchesDistance(d: number | undefined, def: PbDef) {
  return d != null && d >= def.distanceM! * (1 - 0.002) && d <= def.distanceM! * (1 + slack(def.sport))
}

const matchesTime = (t: number | undefined, def: PbDef) => t != null && Math.abs(t - def.durationSec!) <= 1

export function personalBests(sessions: Session[]): Pb[] {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''))
  const out: Pb[] = []
  for (const def of PB_DEFS) {
    const efforts: Effort[] = []
    for (const s of sorted.filter((x) => x.sport === def.sport)) {
      const candidates = [{ distanceM: s.distanceM, durationSec: s.durationSec, rep: undefined as number | undefined }, ...(s.pieces ?? []).map((p, i) => ({ ...p, rep: i + 1 }))]
      for (const c of candidates) {
        if (def.distanceM && c.durationSec && matchesDistance(c.distanceM, def)) efforts.push({ value: c.durationSec, date: s.date, sessionId: s.id, rep: c.rep })
        if (def.durationSec && c.distanceM && matchesTime(c.durationSec, def)) efforts.push({ value: c.distanceM, date: s.date, sessionId: s.id, rep: c.rep })
      }
    }
    if (!efforts.length) continue
    const better = (a: number, b: number) => (def.distanceM ? a < b : a > b)
    const progression: Effort[] = []
    for (const e of efforts) if (!progression.length || better(e.value, progression.at(-1)!.value)) progression.push(e)
    out.push({ def, best: progression.at(-1)!, progression })
  }
  return out
}

// ---- Lifts -------------------------------------------------------------------

export interface LiftPoint {
  date: string
  /** Estimated (Epley) or tested 1RM. */
  kg: number
  tested: boolean
}

/** Best estimated 1RM per day for each lift, plus tested 1RMs from Maxes. */
export function liftTrends(sessions: Session[], maxes: OneRepMax[]) {
  const byLift = new Map<string, { name: string; points: Map<string, LiftPoint> }>()
  const add = (name: string, p: LiftPoint) => {
    const key = name.trim().toLowerCase()
    if (!key) return
    const entry = byLift.get(key) ?? { name: name.trim(), points: new Map() }
    const prev = entry.points.get(p.date)
    if (!prev || p.kg > prev.kg) entry.points.set(p.date, p)
    byLift.set(key, entry)
  }
  for (const s of sessions) {
    for (const e of s.exercises ?? []) {
      const { e1rm } = exerciseStats(e)
      if (e1rm) add(e.name, { date: s.date, kg: e1rm, tested: false })
    }
  }
  for (const m of maxes) add(m.exercise, { date: m.date, kg: m.kg, tested: true })
  return [...byLift.values()]
    .map((l) => ({ name: l.name, points: [...l.points.values()].sort((a, b) => a.date.localeCompare(b.date)) }))
    .filter((l) => l.points.length >= 2)
    .sort((a, b) => b.points.length - a.points.length)
}

// ---- Repeat attempts at library workouts ------------------------------------------

export type AttemptMetric = 'pace' | 'volume' | 'time' | 'rounds'

export interface Attempt {
  sessionId: string
  date: string
  value: number
  hr?: number
}

export interface Benchmark {
  workout: Workout
  metric: AttemptMetric
  kind?: PaceKind
  /** True when a lower number is better (pace, time). */
  lowerBetter: boolean
  attempts: Attempt[]
}

/** How each attempt at a library workout compares, for workouts done at least twice. */
export function benchmarks(sessions: Session[], workouts: Workout[], units: Units): Benchmark[] {
  const out: Benchmark[] = []
  for (const w of workouts) {
    const done = sessions.filter((s) => s.workoutId === w.id).sort((a, b) => a.date.localeCompare(b.date))
    if (done.length < 2) continue
    const kind = paceKind(w.sport, units)
    let metric: AttemptMetric
    let pick: (s: Session) => number | undefined
    if (w.exercises?.length) {
      metric = 'volume'
      pick = (s) => (s.exercises ?? []).reduce((a, e) => a + exerciseStats(e).volumeKg, 0) || undefined
    } else if (w.wod) {
      metric = w.wod.format === 'amrap' ? 'rounds' : 'time'
      pick = (s) => (metric === 'rounds' ? s.wod?.rounds : s.wod?.resultSec)
    } else if (kind) {
      metric = 'pace'
      pick = (s) => (s.pieces?.length ? summarisePieces(s.pieces, s.sport, kind).avgPace : paceValue(kind, s.distanceM, s.durationSec))
    } else continue
    const attempts: Attempt[] = done.flatMap((s) => {
      const value = pick(s)
      return value == null ? [] : [{ sessionId: s.id, date: s.date, value, hr: s.pieces?.length ? summarisePieces(s.pieces, s.sport).avgHr : s.hrAvg }]
    })
    if (attempts.length < 2) continue
    const speed = kind === 'speedKmh' || kind === 'speedMph'
    out.push({ workout: w, metric, kind: metric === 'pace' ? kind : undefined, lowerBetter: metric === 'time' || (metric === 'pace' && !speed), attempts })
  }
  return out.sort((a, b) => b.attempts.at(-1)!.date.localeCompare(a.attempts.at(-1)!.date))
}

// ---- Aerobic trend -------------------------------------------------------------

const EASY = new Set(['steady', 'easy', 'endurance', 'long', 'recovery', 'technique', 'pool'])

export interface AerobicWeek {
  start: string
  pace?: number
  hr?: number
  sessions: number
}

/** Weekly average pace (and HR) of easy sessions in one sport: faster at the same HR is fitter. */
export function aerobicTrend(sessions: Session[], sport: Sport, weeks: string[], units: Units): { kind: PaceKind; weeks: AerobicWeek[] } | undefined {
  const kind = paceKind(sport, units)
  if (!kind) return undefined
  const easy = sessions.filter((s) => s.sport === sport && s.type && EASY.has(s.type) && s.distanceM && s.durationSec)
  const out = weeks.map((start) => {
    const wk = easy.filter((s) => inWeek(s.date, start))
    const dist = wk.reduce((a, s) => a + s.distanceM!, 0)
    const sec = wk.reduce((a, s) => a + s.durationSec!, 0)
    return { start, pace: wk.length ? paceValue(kind, dist, sec) : undefined, hr: mean(wk.map((s) => s.hrAvg).filter((h): h is number => h != null)), sessions: wk.length }
  })
  return out.filter((w) => w.pace != null).length >= 3 ? { kind, weeks: out } : undefined
}
