// Personal bests. Endurance PBs are the fastest time over a standard distance, from a
// whole session or a single piece of that distance. Strength PBs are the best estimated
// 1RM per lift (Epley, sets of 12 reps or fewer) and the heaviest weight lifted.

import { exerciseStats } from '../log/stats'
import type { Session, Sport } from '../log/types'
import { counted } from './load'

export interface DistanceDef {
  m: number
  label: string
}

/** Standard distances per sport. Rowing and erg share 2k etc. but are kept apart: water times aren't erg times. */
export const PB_DISTANCES: Partial<Record<Sport, DistanceDef[]>> = {
  erg: [
    { m: 500, label: '500m' },
    { m: 1000, label: '1k' },
    { m: 2000, label: '2k' },
    { m: 5000, label: '5k' },
    { m: 6000, label: '6k' },
    { m: 10000, label: '10k' },
    { m: 21097, label: 'Half marathon' },
  ],
  row: [
    { m: 1000, label: '1k' },
    { m: 2000, label: '2k' },
    { m: 5000, label: '5k' },
  ],
  run: [
    { m: 1000, label: '1k' },
    { m: 1609, label: 'Mile' },
    { m: 5000, label: '5k' },
    { m: 10000, label: '10k' },
    { m: 21097, label: 'Half marathon' },
    { m: 42195, label: 'Marathon' },
  ],
  bike: [
    { m: 10000, label: '10k' },
    { m: 20000, label: '20k' },
    { m: 40000, label: '40k' },
  ],
  swim: [
    { m: 100, label: '100m' },
    { m: 400, label: '400m' },
    { m: 750, label: '750m' },
    { m: 1500, label: '1500m' },
  ],
}

/** A logged distance counts as the standard one if within this share of it (GPS and course wobble). */
const TOLERANCE = 0.015

export interface DistancePb {
  sport: Sport
  dist: DistanceDef
  sec: number
  /** Time scaled to exactly the standard distance, when the logged one was a little off. */
  distM: number
  date: string
  sessionId: string
  /** Set when the PB came from one piece of an interval session. */
  piece?: number
  /** Previous best, to show the improvement. */
  previousSec?: number
  attempts: number
}

export function distancePbs(sessions: Session[]): DistancePb[] {
  const out: DistancePb[] = []
  for (const [sport, dists] of Object.entries(PB_DISTANCES) as [Sport, DistanceDef[]][]) {
    for (const dist of dists) {
      const efforts: { sec: number; distM: number; date: string; sessionId: string; piece?: number }[] = []
      const near = (m?: number) => m != null && Math.abs(m - dist.m) <= dist.m * TOLERANCE
      for (const s of sessions) {
        if (!counted(s) || s.sport !== sport) continue
        if (near(s.distanceM) && s.durationSec) efforts.push({ sec: (s.durationSec * dist.m) / s.distanceM!, distM: s.distanceM!, date: s.date, sessionId: s.id })
        s.pieces?.forEach((p, i) => {
          if (near(p.distanceM) && p.durationSec) efforts.push({ sec: (p.durationSec * dist.m) / p.distanceM!, distM: p.distanceM!, date: s.date, sessionId: s.id, piece: i })
        })
      }
      if (!efforts.length) continue
      efforts.sort((a, b) => a.date.localeCompare(b.date))
      let best = efforts[0]
      let previous: number | undefined
      for (const e of efforts.slice(1)) {
        if (e.sec < best.sec) {
          previous = best.sec
          best = e
        }
      }
      out.push({ sport, dist, ...best, previousSec: previous, attempts: efforts.length })
    }
  }
  return out
}

export interface LiftPb {
  exercise: string
  e1rm?: number
  e1rmDate?: string
  topKg?: number
  topDate?: string
  sessionId: string
  /** Best e1RM per session over time, oldest first, for a sparkline. */
  history: { date: string; e1rm: number }[]
}

export function liftPbs(sessions: Session[]): LiftPb[] {
  const map = new Map<string, LiftPb>()
  const ordered = sessions.filter(counted).sort((a, b) => a.date.localeCompare(b.date))
  for (const s of ordered) {
    for (const ex of s.exercises ?? []) {
      const name = ex.name.trim()
      if (!name) continue
      const key = name.toLowerCase()
      const { top, e1rm } = exerciseStats(ex)
      if (top == null && e1rm == null) continue
      const pb = map.get(key) ?? { exercise: name, sessionId: s.id, history: [] }
      if (e1rm != null) {
        const last = pb.history[pb.history.length - 1]
        if (last?.date === s.date) last.e1rm = Math.max(last.e1rm, e1rm)
        else pb.history.push({ date: s.date, e1rm })
        if (pb.e1rm == null || e1rm > pb.e1rm) Object.assign(pb, { e1rm, e1rmDate: s.date, sessionId: s.id })
      }
      if (top != null && (pb.topKg == null || top > pb.topKg)) Object.assign(pb, { topKg: top, topDate: s.date })
      map.set(key, pb)
    }
  }
  return [...map.values()].sort((a, b) => (b.e1rm ?? b.topKg ?? 0) - (a.e1rm ?? a.topKg ?? 0))
}
