// Suggested fitness markers from what's been logged. Nothing is saved from here: the
// athlete confirms each one. The formulas are coaching convention; each suggestion says
// which one it used.

import { pieceWatts } from '../log/stats'
import type { Marker, MarkerKind, MarkerSource, Piece, Session } from '../log/types'
import { addDays } from '../plan/dates'
import { currentMarkers } from './markers'

export interface Suggestion {
  kind: MarkerKind
  value: number
  date: string
  source: MarkerSource
  sessionId: string
  /** How it was worked out, in a line. */
  how: string
}

const minutes = (sec?: number) => (sec ?? 0) / 60

// ---- Running: Daniels' VDOT -------------------------------------------------------------
// Daniels & Gilbert's equations, as used in Daniels' Running Formula: the oxygen cost of
// running at v metres a minute, and the fraction of VO2max that can be held for t minutes.

const vo2Cost = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v
const sustainable = (t: number) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t)

/** VDOT from a race or flat-out effort over `distM` metres in `sec` seconds. */
export function vdot(distM: number, sec: number) {
  const t = sec / 60
  return vo2Cost(distM / t) / sustainable(t)
}

/**
 * Threshold pace in s/km from a race: the pace whose oxygen cost is the share of VDOT that
 * can be held for 60 minutes (Daniels' definition of threshold).
 */
export function thresholdFromRace(distM: number, sec: number) {
  const target = vdot(distM, sec) * sustainable(60)
  const [a, b, c] = [0.000104, 0.182258, -4.6 - target]
  const v = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
  return 60000 / v
}

/** Distance and time of the effort: the session's own, or its single rep. */
function effort(s: Session): { distM?: number; sec?: number } {
  if (s.distanceM && s.durationSec) return { distM: s.distanceM, sec: s.durationSec }
  const work = (s.pieces ?? []).filter((p) => p.distanceM && p.durationSec)
  if (work.length === 1) return { distM: work[0].distanceM, sec: work[0].durationSec }
  return { distM: s.distanceM, sec: s.durationSec }
}

function fromRun(s: Session): Suggestion | undefined {
  const { distM, sec } = effort(s)
  if (!distM || !sec || (s.type !== 'test' && s.type !== 'race')) return undefined
  const base = { kind: 'runThreshold' as const, date: s.date, sessionId: s.id }
  if (s.type === 'test' && minutes(sec) >= 25 && minutes(sec) <= 35) {
    return { ...base, value: Math.round((sec / distM) * 1000), source: 'test', how: 'Average pace of a 30′ time trial (Friel).' }
  }
  // Races from 3k to a half: the equations hold best over these.
  if (distM >= 3000 && distM <= 21500 && minutes(sec) >= 9) {
    return {
      ...base,
      value: Math.round(thresholdFromRace(distM, sec)),
      source: s.type === 'race' ? 'race' : 'estimate',
      how: `From a ${(distM / 1000).toFixed(distM % 1000 ? 1 : 0)}k ${s.type === 'race' ? 'race' : 'effort'}, with Daniels’ VDOT equations.`,
    }
  }
  return undefined
}

// ---- Bike: 95% of a 20′ test --------------------------------------------------------------

const isTwenty = (sec?: number) => minutes(sec) >= 19 && minutes(sec) <= 21

function fromBike(s: Session): Suggestion | undefined {
  if (s.type !== 'test' && s.type !== 'race') return undefined
  const base = { kind: 'ftp' as const, date: s.date, sessionId: s.id }
  const twenty = (s.pieces ?? []).find((p) => isTwenty(p.durationSec) && pieceWatts(p, 'bike'))
  const w20 = twenty ? pieceWatts(twenty, 'bike') : isTwenty(s.durationSec) ? s.watts : undefined
  if (w20 && s.type === 'test') return { ...base, value: Math.round(w20 * 0.95), source: 'test', how: '95% of average power over 20′ (Allen & Coggan).' }
  if (s.watts && minutes(s.durationSec) >= 55 && minutes(s.durationSec) <= 65) {
    return { ...base, value: Math.round(s.watts), source: s.type === 'race' ? 'race' : 'estimate', how: 'Average power over about an hour, which is what FTP describes.' }
  }
  return undefined
}

// ---- Erg: the 2k itself ------------------------------------------------------------------

function fromErg(s: Session): Suggestion | undefined {
  if (s.type !== 'test' && s.type !== 'race') return undefined
  const two = (s.pieces ?? []).filter((p) => p.distanceM === 2000 && p.durationSec)
  const sec = two.length === 1 ? two[0].durationSec : s.distanceM === 2000 && !s.pieces?.length ? s.durationSec : undefined
  if (!sec) return undefined
  return { kind: 'erg2k', value: sec, date: s.date, sessionId: s.id, source: s.type === 'race' ? 'race' : 'test', how: 'Your 2k time.' }
}

// ---- Swim: CSS from 400 and 200 -----------------------------------------------------------

function fromSwim(s: Session): Suggestion | undefined {
  const find = (m: number) => (s.pieces ?? []).filter((p: Piece) => p.distanceM === m && p.durationSec).sort((a, b) => a.durationSec! - b.durationSec!)[0]
  const t400 = find(400)?.durationSec
  const t200 = find(200)?.durationSec
  if (s.type !== 'test' || !t400 || !t200 || t400 <= t200) return undefined
  return {
    kind: 'css',
    value: Math.round(((t400 - t200) / 200) * 10000) / 10,
    date: s.date,
    sessionId: s.id,
    source: 'test',
    how: 'CSS = (400m time − 200m time) ÷ 2 per 100m: the slope of distance against time, the critical velocity of Wakayoshi et al. (1992) from two swims.',
  }
}

/** What one logged session says about the athlete's markers. */
export function suggestFromSession(s: Session): Suggestion[] {
  if (s.status !== 'completed') return []
  const one = s.sport === 'run' ? fromRun(s) : s.sport === 'bike' ? fromBike(s) : s.sport === 'erg' ? fromErg(s) : s.sport === 'swim' ? fromSwim(s) : undefined
  return one ? [one] : []
}

/** How far back the log is searched for new markers. */
export const SUGGEST_WEEKS = 12

/**
 * New markers the log points to: from sessions newer than the current marker of that kind,
 * not already saved, one per kind (the latest, a test before an estimate on the same day).
 * Also a higher max HR when a session saw one above the current max.
 */
export function suggestFromLog(sessions: Session[], markers: Marker[], today: string, maxHr?: number): Suggestion[] {
  const current = currentMarkers(markers)
  const saved = new Set(markers.map((m) => m.sessionId).filter(Boolean))
  const since = addDays(today, -SUGGEST_WEEKS * 7)
  const rank: Record<MarkerSource, number> = { test: 3, race: 2, manual: 1, estimate: 0 }
  const best = new Map<MarkerKind, Suggestion>()
  for (const s of sessions) {
    if (s.date < since || s.date > today || saved.has(s.id)) continue
    for (const g of suggestFromSession(s)) {
      const cur = current[g.kind]
      if (cur && (g.date < cur.date || (g.date === cur.date && cur.source !== 'estimate'))) continue
      const have = best.get(g.kind)
      if (!have || g.date > have.date || (g.date === have.date && rank[g.source] > rank[have.source])) best.set(g.kind, g)
    }
  }
  const knownMax = current.maxHr?.value ?? maxHr ?? 0
  const top = sessions
    .filter((s) => s.date >= since && s.date <= today && s.hrMax && !saved.has(s.id))
    .sort((a, b) => b.hrMax! - a.hrMax!)[0]
  // A one-off spike from a strap is common, so only well-placed readings (under 230) count.
  if (top && top.hrMax! > knownMax && top.hrMax! < 230) {
    best.set('maxHr', { kind: 'maxHr', value: top.hrMax!, date: top.date, sessionId: top.id, source: 'estimate', how: 'The highest heart rate in your log, above your current max.' })
  }
  return [...best.values()].sort((a, b) => b.date.localeCompare(a.date))
}
