// Fitness markers: the threshold numbers per sport that zones and targets come from.
// Each value is kept, so the history can be charted; the latest by date is current.

import { formatTime, paceFromBase, paceKind, paceToBase, PACE_LABEL, parseTime } from '../log/format'
import type { Marker, MarkerKind, MarkerSource, Sport } from '../log/types'
import { daysBetween } from '../plan/dates'
import type { Units } from '../settings/SettingsContext'

export interface MarkerDef {
  kind: MarkerKind
  label: string
  /** Short name for tiles and charts. */
  short: string
  /** The sport whose targets it sets; HR markers set none. */
  sport?: Sport
  /** Bigger is fitter (watts) or smaller is (paces, times, resting HR). */
  higherIsBetter: boolean
  /** How to find it, in a line. */
  how: string
}

export const MARKERS: MarkerDef[] = [
  {
    kind: 'runThreshold',
    label: 'Run threshold pace',
    short: 'Run threshold',
    sport: 'run',
    higherIsBetter: false,
    how: 'Average pace of a 30′ solo time trial, run as hard as you can hold evenly.',
  },
  { kind: 'ftp', label: 'Bike FTP', short: 'FTP', sport: 'bike', higherIsBetter: true, how: '95% of your average power over a 20′ all-out test.' },
  { kind: 'erg2k', label: 'Erg 2k', short: '2k', sport: 'erg', higherIsBetter: false, how: 'Your best 2,000m erg time, from a test or race.' },
  {
    kind: 'css',
    label: 'Swim CSS',
    short: 'CSS',
    sport: 'swim',
    higherIsBetter: false,
    how: 'Critical swim speed: swim 400m then (after an easy 5–10′) 200m, both flat out. CSS = (400 time − 200 time) ÷ 2 per 100m.',
  },
  { kind: 'maxHr', label: 'Max heart rate', short: 'Max HR', higherIsBetter: true, how: 'The highest heart rate you see in an all-out effort. Sets your HR zones.' },
  { kind: 'restHr', label: 'Resting heart rate', short: 'Resting HR', higherIsBetter: false, how: 'Taken lying down, first thing in the morning.' },
]

export const markerDef = (k: MarkerKind) => MARKERS.find((m) => m.kind === k)!

export const SOURCE_LABEL: Record<MarkerSource, string> = { test: 'Test', race: 'Race', estimate: 'Estimate', manual: 'Entered' }

/** Marker kind behind a sport's pace or power targets. */
export const MARKER_FOR_SPORT: Partial<Record<Sport, MarkerKind>> = { run: 'runThreshold', bike: 'ftp', erg: 'erg2k', swim: 'css' }

/** Targets from a marker older than this are shown as an estimate. */
export const STALE_WEEKS = 8

const byDate = (a: Marker, b: Marker) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)

/** Every value of one kind, oldest first. */
export const markerHistory = (markers: Marker[], kind: MarkerKind) => markers.filter((m) => m.kind === kind).sort(byDate)

export const currentMarker = (markers: Marker[], kind: MarkerKind): Marker | undefined => markerHistory(markers, kind).at(-1)

export type CurrentMarkers = Partial<Record<MarkerKind, Marker>>

export function currentMarkers(markers: Marker[]): CurrentMarkers {
  const out: CurrentMarkers = {}
  for (const m of [...markers].sort(byDate)) out[m.kind] = m
  return out
}

export const weeksOld = (m: Pick<Marker, 'date'>, today: string) => daysBetween(m.date, today) / 7

export const isStale = (m: Pick<Marker, 'date'>, today: string) => weeksOld(m, today) > STALE_WEEKS

/** HR markers aren't tested on a schedule; the others are, every `retestWeeks`. */
export const isDue = (m: Marker, today: string, retestWeeks: number) => !!markerDef(m.kind).sport && weeksOld(m, today) >= retestWeeks

/** Whether `b` is fitter than `a`, by the marker's own direction. */
export const improved = (kind: MarkerKind, a: number, b: number) => (markerDef(kind).higherIsBetter ? b > a : b < a)

// ---- Showing and typing values ------------------------------------------------------

/** The unit a value is typed and read in. */
export function markerUnit(kind: MarkerKind, units: Units) {
  if (kind === 'ftp') return 'W'
  if (kind === 'maxHr' || kind === 'restHr') return 'bpm'
  if (kind === 'erg2k') return ''
  const pk = paceKind(kind === 'css' ? 'swim' : 'run', units)!
  return PACE_LABEL[pk]
}

export function formatMarker(kind: MarkerKind, value: number, units: Units, withUnit = true): string {
  const unit = markerUnit(kind, units)
  let text: string
  if (kind === 'ftp' || kind === 'maxHr' || kind === 'restHr') text = String(Math.round(value))
  else if (kind === 'erg2k') text = formatTime(value)
  else text = formatTime(paceFromBase(paceKind(kind === 'css' ? 'swim' : 'run', units)!, value))
  return withUnit && unit ? `${text}${unit.startsWith('/') ? '' : ' '}${unit}` : text
}

/** Typed text → base value, or undefined if it doesn't read. */
export function parseMarker(kind: MarkerKind, text: string, units: Units): number | undefined {
  const t = text.trim()
  if (!t) return undefined
  if (kind === 'ftp' || kind === 'maxHr' || kind === 'restHr') {
    const n = Number(t)
    return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
  }
  const sec = parseTime(t, 'min')
  if (!sec || sec <= 0) return undefined
  if (kind === 'erg2k') return sec
  return paceToBase(paceKind(kind === 'css' ? 'swim' : 'run', units)!, sec)
}

/** "+5s" / "−0:02.0" style change between two values, with whether it's an improvement. */
export function describeChange(kind: MarkerKind, from: number, to: number, units: Units) {
  const diff = to - from
  if (Math.abs(diff) < 1e-9) return { text: 'no change', better: undefined }
  const better = improved(kind, from, to)
  if (kind === 'ftp' || kind === 'maxHr' || kind === 'restHr') return { text: `${diff > 0 ? '+' : '−'}${Math.round(Math.abs(diff))} ${markerUnit(kind, units)}`, better }
  const shownDiff = kind === 'erg2k' ? Math.abs(diff) : Math.abs(paceFromBase(paceKind(kind === 'css' ? 'swim' : 'run', units)!, to) - paceFromBase(paceKind(kind === 'css' ? 'swim' : 'run', units)!, from))
  const text = shownDiff < 60 ? `${shownDiff.toFixed(1)}s` : formatTime(shownDiff)
  return { text: `${diff > 0 ? 'slower by' : 'faster by'} ${text}`, better }
}
