import type { Units } from '../settings/SettingsContext'
import type { Sport } from './types'

// ---- Times ---------------------------------------------------------------

/**
 * Parses "1:02:03", "7:12.4", "45" or "45.5". A bare number is read as minutes
 * (or seconds when bare = 'sec'). Returns undefined for empty or invalid input.
 */
export function parseTime(text: string, bare: 'min' | 'sec' = 'min'): number | undefined {
  const t = text.trim().replace(',', '.')
  if (!t) return undefined
  if (!/^\d+(\.\d+)?(:\d{1,2}(\.\d+)?){0,2}$/.test(t)) return undefined
  const parts = t.split(':').map(Number)
  if (parts.some((p) => !Number.isFinite(p))) return undefined
  if (parts.length === 1) return bare === 'min' ? parts[0] * 60 : parts[0]
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}

/** 432.4 → "7:12.4", 3723 → "1:02:03". Tenths only when present. */
export function formatTime(sec: number | undefined, tenths = true): string {
  if (sec == null || !Number.isFinite(sec)) return ''
  const rounded = tenths ? Math.round(sec * 10) / 10 : Math.round(sec)
  const h = Math.floor(rounded / 3600)
  const m = Math.floor((rounded % 3600) / 60)
  const s = rounded % 60
  const whole = Math.floor(s)
  const frac = Math.round((s - whole) * 10)
  const ss = `${String(whole).padStart(2, '0')}${tenths && frac ? `.${frac}` : ''}`
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Clock time "HH:MM[:SS]" → seconds after midnight. */
export function clockToSec(t: string | undefined): number | undefined {
  if (!t) return undefined
  const [h, m, s = 0] = t.split(':').map(Number)
  if (![h, m, s].every(Number.isFinite)) return undefined
  return h * 3600 + m * 60 + s
}

export function secToClock(sec: number): string {
  const s = ((Math.round(sec) % 86400) + 86400) % 86400
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

// ---- Distance, weight ----------------------------------------------------

const M_PER_MI = 1609.344
const KG_PER_LB = 0.45359237
const M_PER_FT = 0.3048

/** Rowing and swimming are always in metres; run/bike follow the units setting. */
export function distanceUnit(sport: Sport, units: Units): 'm' | 'km' | 'mi' {
  if (sport === 'row' || sport === 'erg' || sport === 'swim') return 'm'
  return units === 'metric' ? 'km' : 'mi'
}

export function distanceFactor(unit: 'm' | 'km' | 'mi') {
  return unit === 'm' ? 1 : unit === 'km' ? 1000 : M_PER_MI
}

export function formatDistance(m: number | undefined, unit: 'm' | 'km' | 'mi'): string {
  if (m == null) return ''
  if (unit === 'm') return `${Math.round(m).toLocaleString('en-GB')}`
  return (m / distanceFactor(unit)).toFixed(2).replace(/\.?0+$/, '')
}

export const weightUnit = (units: Units) => (units === 'metric' ? 'kg' : 'lb')
export const weightFactor = (units: Units) => (units === 'metric' ? 1 : KG_PER_LB)
export const formatWeight = (kg: number | undefined, units: Units) =>
  kg == null ? '' : String(Math.round((kg / weightFactor(units)) * 10) / 10)

export const elevationUnit = (units: Units) => (units === 'metric' ? 'm' : 'ft')
export const elevationFactor = (units: Units) => (units === 'metric' ? 1 : M_PER_FT)

// ---- Pace / split / speed ------------------------------------------------

export type PaceKind = 'split500' | 'per100' | 'perKm' | 'perMi' | 'speedKmh' | 'speedMph'

export function paceKind(sport: Sport, units: Units): PaceKind | undefined {
  if (sport === 'row' || sport === 'erg') return 'split500'
  if (sport === 'swim') return 'per100'
  if (sport === 'run') return units === 'metric' ? 'perKm' : 'perMi'
  if (sport === 'bike') return units === 'metric' ? 'speedKmh' : 'speedMph'
  return undefined
}

export const PACE_LABEL: Record<PaceKind, string> = {
  split500: '/500m',
  per100: '/100m',
  perKm: '/km',
  perMi: '/mi',
  speedKmh: 'km/h',
  speedMph: 'mph',
}

const PACE_METRES: Record<PaceKind, number> = { split500: 500, per100: 100, perKm: 1000, perMi: M_PER_MI, speedKmh: 1000, speedMph: M_PER_MI }

export const isSpeed = (k: PaceKind) => k === 'speedKmh' || k === 'speedMph'

/** Pace in seconds per unit distance, or speed in units per hour. */
export function paceValue(kind: PaceKind, distM?: number, sec?: number): number | undefined {
  if (!distM || !sec) return undefined
  return isSpeed(kind) ? distM / PACE_METRES[kind] / (sec / 3600) : (sec / distM) * PACE_METRES[kind]
}

export function formatPace(kind: PaceKind, value: number | undefined): string {
  if (value == null) return ''
  return isSpeed(kind) ? value.toFixed(1) : formatTime(value)
}

/** Pace target base unit (s/km) → the sport's display value, and back. */
export function paceFromBase(kind: PaceKind, sPerKm: number) {
  return isSpeed(kind) ? (3600 / sPerKm) * (1000 / PACE_METRES[kind]) : (sPerKm * PACE_METRES[kind]) / 1000
}

export function paceToBase(kind: PaceKind, value: number) {
  return isSpeed(kind) ? (3600 * 1000) / (value * PACE_METRES[kind]) : (value * 1000) / PACE_METRES[kind]
}

/** Given a pace and one of distance/time, works out the other. */
export function fromPace(kind: PaceKind, value: number, known: { distM?: number; sec?: number }): { distM?: number; sec?: number } {
  const per = PACE_METRES[kind]
  if (known.distM) {
    const sec = isSpeed(kind) ? (known.distM / per / value) * 3600 : (known.distM / per) * value
    return { distM: known.distM, sec: Math.round(sec * 10) / 10 }
  }
  if (known.sec) {
    const distM = isSpeed(kind) ? value * (known.sec / 3600) * per : (known.sec / value) * per
    return { distM: Math.round(distM), sec: known.sec }
  }
  return known
}

/** Concept2 formula: watts = 2.80 / (sec per metre)³. */
export function ergWatts(splitSec500: number | undefined): number | undefined {
  if (!splitSec500) return undefined
  return Math.round(2.8 / Math.pow(splitSec500 / 500, 3))
}

// ---- Strength ------------------------------------------------------------

/** Epley estimate. Ignores sets over 12 reps where the estimate is poor. */
export function estimate1Rm(kg?: number, reps?: number): number | undefined {
  if (!kg || !reps || reps > 12) return undefined
  return reps === 1 ? kg : Math.round(kg * (1 + reps / 30) * 2) / 2
}

// ---- Dates ---------------------------------------------------------------

export function todayIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function nowClock(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', opts)
}

export const newId = () => crypto.randomUUID()
