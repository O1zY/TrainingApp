import type { Units } from '../settings/SettingsContext'

const KM_PER_MILE = 1.609344
const LB_PER_KG = 2.2046226

/** 3725 → "1:02:05", 452 → "7:32". */
export function formatDuration(totalS: number) {
  const s = Math.round(totalS)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}

/** Seconds as m:ss with one decimal when asked, for rowing splits (1:42.3). */
export function formatClock(totalS: number, decimals = 0) {
  const m = Math.floor(totalS / 60)
  const s = totalS - m * 60
  const str = decimals ? s.toFixed(decimals) : String(Math.round(s))
  // Rounding can push 59.96 up to 60.0; carry it into the minutes.
  if (parseFloat(str) >= 60) return formatClock((m + 1) * 60, decimals)
  return `${m}:${str.padStart(decimals ? 3 + decimals : 2, '0')}`
}

export function distance(m: number, units: Units, sport?: string) {
  // Rowing distances are always quoted in metres.
  if (sport === 'row') return { value: Math.round(m).toLocaleString('en-GB'), unit: 'm' }
  const km = m / 1000
  const v = units === 'metric' ? km : km / KM_PER_MILE
  return { value: v.toFixed(v < 10 ? 2 : 1), unit: units === 'metric' ? 'km' : 'mi' }
}

/** Seconds per km for a run, from time and distance. */
export const paceSPerKm = (durationS: number, distanceM: number) => durationS / (distanceM / 1000)

/** Seconds per 500m for rowing, from time and distance. */
export const splitSPer500 = (durationS: number, distanceM: number) => durationS / (distanceM / 500)

export function pace(sPerKm: number, units: Units) {
  const v = units === 'metric' ? sPerKm : sPerKm * KM_PER_MILE
  return { value: formatClock(v), unit: units === 'metric' ? '/km' : '/mi' }
}

export const split = (sPer500: number) => ({ value: formatClock(sPer500, 1), unit: '/500m' })

export function speed(durationS: number, distanceM: number, units: Units) {
  const kmh = distanceM / 1000 / (durationS / 3600)
  const v = units === 'metric' ? kmh : kmh / KM_PER_MILE
  return { value: v.toFixed(1), unit: units === 'metric' ? 'km/h' : 'mph' }
}

export function weight(kg: number, units: Units) {
  const v = units === 'metric' ? kg : kg * LB_PER_KG
  return { value: Number.isInteger(v) ? String(v) : v.toFixed(1), unit: units === 'metric' ? 'kg' : 'lb' }
}
