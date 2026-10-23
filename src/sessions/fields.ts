// Which numbers each sport shows, and where. "Headline" stats are the
// overview on a session card; "detail" stats appear when it's expanded.

import { Bike, Dumbbell, Footprints, HeartPulse, Waves, type LucideIcon } from 'lucide-react'
import type { Units } from '../settings/SettingsContext'
import { distance, formatClock, formatDuration, pace, paceSPerKm, speed, split, splitSPer500, weight } from './format'
import { summarise } from './intervals'
import type { Intent, Interval, Session, Sport, TargetMetric } from './types'

export interface Stat {
  label: string
  value: string
  unit?: string
}

export const SPORTS: Record<Sport, { label: string; icon: LucideIcon; text: string; bg: string }> = {
  // Full class names so Tailwind picks them up.
  row: { label: 'Rowing', icon: Waves, text: 'text-sport-row', bg: 'bg-sport-row' },
  run: { label: 'Running', icon: Footprints, text: 'text-sport-run', bg: 'bg-sport-run' },
  bike: { label: 'Cycling', icon: Bike, text: 'text-sport-bike', bg: 'bg-sport-bike' },
  strength: { label: 'Strength', icon: Dumbbell, text: 'text-sport-strength', bg: 'bg-sport-strength' },
  recovery: { label: 'Recovery', icon: HeartPulse, text: 'text-sport-recovery', bg: 'bg-sport-recovery' },
}

export const INTENTS: Record<Intent, string> = {
  easy: 'Easy',
  steady: 'Steady',
  long: 'Long',
  tempo: 'Tempo',
  threshold: 'Threshold',
  intervals: 'Intervals',
  race: 'Race',
  technique: 'Technique',
  strength: 'Strength',
  recovery: 'Recovery',
}

/** Which intents each sport offers when logging. */
export const SPORT_INTENTS: Record<Sport, Intent[]> = {
  row: ['easy', 'steady', 'long', 'threshold', 'intervals', 'race', 'technique'],
  run: ['easy', 'steady', 'long', 'tempo', 'threshold', 'intervals', 'race'],
  bike: ['easy', 'steady', 'long', 'tempo', 'threshold', 'intervals', 'race'],
  strength: ['strength', 'intervals'],
  recovery: ['recovery'],
}

/** Intents where the per-rep breakdown is the point of the session. */
export const STRUCTURED: Intent[] = ['tempo', 'threshold', 'intervals', 'race']

const rateUnit = (sport: Sport) => (sport === 'bike' ? 'rpm' : 'spm')

/** Formats one value of a target metric for this sport, e.g. 1:42.0/500m or 4:05/km. */
export function formatMetric(metric: TargetMetric, v: number, sport: Sport, units: Units): Stat & { text: string } {
  const s: Stat =
    metric === 'power'
      ? { label: 'Power', value: String(Math.round(v)), unit: 'W' }
      : metric === 'pace'
        ? { label: 'Pace', ...pace(v, units) }
        : metric === 'split'
          ? { label: 'Split', ...split(v) }
          : metric === 'hr'
            ? { label: 'HR', value: String(Math.round(v)), unit: 'bpm' }
            : { label: sport === 'row' ? 'Rate' : 'Cadence', value: String(Math.round(v)), unit: rateUnit(sport) }
  return { ...s, text: `${s.value}${s.unit === 'W' || s.unit?.startsWith('/') ? '' : ' '}${s.unit ?? ''}` }
}

/** "5 × 1500m / 5:00r", "6 × 4:00 / 2:00r", or "7 reps" for mixed sets. */
export function describeReps(reps: Interval[], sport: Sport, units: Units) {
  const same = <T,>(f: (r: Interval) => T) => reps.every((r) => f(r) === f(reps[0]))
  let work = `${reps.length} reps`
  if (reps[0].distanceM && same((r) => r.distanceM)) {
    const d = distance(reps[0].distanceM, units, sport)
    // 1000m runs read better as 1km, but rowing stays in metres.
    work = `${reps.length} × ${d.unit === 'm' ? `${d.value}m` : `${Number(d.value)}${d.unit}`}`
  } else if (same((r) => r.durationS)) {
    work = `${reps.length} × ${formatClock(reps[0].durationS)}`
  }
  // The final rep usually has no rest after it, so only compare the others.
  const rests = reps.slice(0, -1)
  const rest = rests.length && rests.every((r) => r.restS && r.restS === rests[0].restS) ? rests[0].restS : undefined
  return rest ? `${work} / ${formatClock(rest)}r` : work
}

const dist = (s: Session, units: Units): Stat | undefined =>
  s.distanceM ? { label: 'Distance', ...distance(s.distanceM, units, s.sport) } : undefined
const time = (s: Session): Stat => ({ label: 'Time', value: formatDuration(s.durationS) })
const hr = (s: Session): Stat | undefined => (s.avgHR ? { label: 'Avg HR', value: String(s.avgHR), unit: 'bpm' } : undefined)

/** The three or four numbers that sum a session up at a glance. */
export function headlineStats(s: Session, units: Units): Stat[] {
  const out: (Stat | undefined)[] = []
  // For interval sessions the whole-session average is diluted by warm-up and
  // rests, so the overview shows the average across the work reps instead.
  const reps = STRUCTURED.includes(s.intent) ? summarise(s) : undefined
  const repDist = reps?.distanceM ? reps : undefined
  switch (s.sport) {
    case 'row':
      out.push(dist(s, units), time(s))
      if (repDist) out.push({ label: 'Rep avg split', ...split(splitSPer500(repDist.workS, repDist.distanceM)) })
      else if (s.distanceM) out.push({ label: 'Avg split', ...split(splitSPer500(s.durationS, s.distanceM)) })
      out.push(
        s.environment === 'erg' && reps?.avgPower
          ? { label: 'Rep avg power', value: String(Math.round(reps.avgPower)), unit: 'W' }
          : s.environment === 'erg' && s.avgPower
          ? { label: 'Avg power', value: String(s.avgPower), unit: 'W' }
          : s.avgRate
            ? { label: 'Rate', value: String(s.avgRate), unit: 'spm' }
            : undefined,
      )
      break
    case 'run':
      out.push(dist(s, units), time(s))
      if (repDist) out.push({ label: 'Rep avg pace', ...pace(paceSPerKm(repDist.workS, repDist.distanceM), units) })
      else if (s.distanceM) out.push({ label: 'Avg pace', ...pace(paceSPerKm(s.durationS, s.distanceM), units) })
      out.push(hr(s))
      break
    case 'bike':
      out.push(dist(s, units), time(s))
      out.push(
        reps?.avgPower
          ? { label: 'Rep avg power', value: String(Math.round(reps.avgPower)), unit: 'W' }
          : s.avgPower
          ? { label: 'Avg power', value: String(s.avgPower), unit: 'W' }
          : s.distanceM
            ? { label: 'Avg speed', ...speed(s.durationS, s.distanceM, units) }
            : undefined,
      )
      out.push(hr(s))
      break
    case 'strength': {
      out.push(time(s))
      const sets = s.exercises?.reduce((a, e) => a + e.sets.length, 0)
      if (s.exercises?.length) out.push({ label: 'Exercises', value: String(s.exercises.length) }, { label: 'Sets', value: String(sets) })
      if (s.wod) out.push({ label: 'Result', value: s.wod.result })
      break
    }
    case 'recovery':
      out.push(time(s), hr(s))
      break
  }
  return out.filter((x): x is Stat => !!x).slice(0, 4)
}

/** Everything else worth showing once a session is opened up. */
export function detailStats(s: Session, units: Units): Stat[] {
  const out: (Stat | undefined)[] = []
  if (s.avgHR) out.push({ label: 'Avg HR', value: String(s.avgHR), unit: 'bpm' })
  if (s.maxHR) out.push({ label: 'Max HR', value: String(s.maxHR), unit: 'bpm' })
  if (s.rpe) out.push({ label: 'RPE', value: String(s.rpe), unit: '/10' })
  // Session-RPE load (Foster): RPE × minutes. Works for every sport, including strength.
  if (s.rpe) out.push({ label: 'Session load', value: String(Math.round((s.rpe * s.durationS) / 60)), unit: 'AU' })

  switch (s.sport) {
    case 'row':
      out.push({ label: 'Type', value: s.environment === 'erg' ? 'Erg' : `Water${s.boat ? ` · ${s.boat}` : ''}` })
      if (s.avgRate) out.push({ label: 'Avg rate', value: String(s.avgRate), unit: 'spm' })
      if (s.avgPower) out.push({ label: 'Avg power', value: String(s.avgPower), unit: 'W' })
      if (s.dragFactor) out.push({ label: 'Drag factor', value: String(s.dragFactor) })
      break
    case 'run':
      if (s.cadence) out.push({ label: 'Cadence', value: String(s.cadence), unit: 'spm' })
      if (s.elevationGainM) out.push({ label: 'Elevation', ...elevation(s.elevationGainM, units) })
      if (s.surface) out.push({ label: 'Surface', value: s.surface[0].toUpperCase() + s.surface.slice(1) })
      break
    case 'bike':
      if (s.distanceM) out.push({ label: 'Avg speed', ...speed(s.durationS, s.distanceM, units) })
      if (s.avgPower) out.push({ label: 'Avg power', value: String(s.avgPower), unit: 'W' })
      if (s.normalizedPower) out.push({ label: 'Norm. power', value: String(s.normalizedPower), unit: 'W' })
      if (s.cadence) out.push({ label: 'Cadence', value: String(s.cadence), unit: 'rpm' })
      if (s.elevationGainM) out.push({ label: 'Elevation', ...elevation(s.elevationGainM, units) })
      out.push({ label: 'Where', value: s.indoor ? 'Indoor' : 'Outdoor' })
      break
    case 'strength': {
      const volume = s.exercises?.reduce((a, e) => a + e.sets.reduce((b, set) => b + set.reps * (set.weightKg ?? 0), 0), 0)
      if (volume) out.push({ label: 'Volume', ...weight(Math.round(volume), units) })
      break
    }
    case 'recovery':
      out.push({ label: 'Activity', value: s.activity[0].toUpperCase() + s.activity.slice(1) })
      break
  }
  out.push({ label: 'Source', value: s.source === 'strava' ? 'Strava' : 'Manual' })
  return out.filter((x): x is Stat => !!x)
}

function elevation(m: number, units: Units) {
  return units === 'metric' ? { value: String(Math.round(m)), unit: 'm' } : { value: String(Math.round(m * 3.28084)), unit: 'ft' }
}
