import { newId } from '../log/format'
import type { SessionDraft } from '../log/LogStore'
import { SPORTS } from '../log/sports'
import type { Piece, Session, Sport } from '../log/types'
import type { StravaActivity, StravaLap } from './api'

// Turning a Strava activity into a session. Everything stays metric (m, s), matching the log.

const ROW_TYPES = new Set(['Rowing', 'VirtualRow'])
const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun'])
const BIKE_TYPES = new Set(['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide', 'EMountainBikeRide', 'Handcycle', 'Velomobile'])
const STRENGTH_TYPES: Record<string, string> = { WeightTraining: 'lifting', Crossfit: 'wod', HighIntensityIntervalTraining: 'circuit' }
const RECOVERY_TYPES: Record<string, string> = { Yoga: 'yoga', Pilates: 'mobility', Walk: 'walk' }

const hasGps = (a: StravaActivity) => !!a.start_latlng && a.start_latlng.length === 2

export function stravaSport(a: StravaActivity): { sport: Sport; type?: string; indoor?: boolean } {
  const t = a.sport_type || a.type || ''
  // Concept2 and other ergs arrive as Rowing with no GPS (or marked as a trainer / virtual row).
  if (ROW_TYPES.has(t)) return t === 'VirtualRow' || a.trainer || !hasGps(a) ? { sport: 'erg' } : { sport: 'row' }
  if (RUN_TYPES.has(t)) return { sport: 'run', indoor: t === 'VirtualRun' || !!a.trainer || undefined }
  if (BIKE_TYPES.has(t)) return { sport: 'bike', indoor: t === 'VirtualRide' || !!a.trainer || undefined }
  if (t === 'Swim') return { sport: 'swim', type: hasGps(a) ? 'open' : 'pool' }
  if (t in STRENGTH_TYPES) return { sport: 'strength', type: STRENGTH_TYPES[t] }
  if (t in RECOVERY_TYPES) return { sport: 'recovery', type: RECOVERY_TYPES[t] }
  return { sport: 'other' }
}

/** Strava's automatic names ("Morning Run", "Lunch Weight Training") add nothing; custom names are kept. */
export function usefulTitle(name: string | undefined) {
  const n = name?.trim()
  if (!n || (/^(morning|lunch|afternoon|evening|night) [\w ]+$/i.test(n) && n.split(' ').length <= 4)) return undefined
  return n
}

const round = (v: number | undefined | null, dp = 0) => (v == null || !Number.isFinite(v) ? undefined : Math.round(v * 10 ** dp) / 10 ** dp)

/** Strava gives running cadence per leg; the log uses steps per minute, as watches show it. */
const cadence = (v: number | undefined, sport: Sport) => round(v == null ? undefined : sport === 'run' ? v * 2 : v)

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

const SPLIT_DISTANCES = [500, 1000, 1609.344, 5000, 10000]

/**
 * Laps become pieces when they look like a workout. Slow laps (under 60% of the typical
 * lap speed) are treated as rest and folded into the piece before them; a slow first lap
 * is a warm-up and dropped. Laps that are all the same standard distance or time with no
 * rest between them are automatic splits, not pieces, and are left out.
 */
export function lapsToPieces(laps: StravaLap[] | undefined, sport: Sport): Piece[] | undefined {
  if (!SPORTS[sport].pieces || !laps || laps.length < 2) return undefined
  const speed = (l: StravaLap) => l.average_speed ?? (l.elapsed_time ? l.distance / l.elapsed_time : 0)
  const typical = median(laps.map(speed))
  const isRest = (l: StravaLap) => typical > 0 && (speed(l) < typical * 0.6 || l.distance < 1)

  const work = laps.filter((l) => !isRest(l))
  if (work.length < 2) return undefined
  if (work.length === laps.length) {
    const body = laps.slice(0, -1)
    const same = (xs: number[]) => xs.every((x) => Math.abs(x - xs[0]) <= xs[0] * 0.015)
    const standardDistance = SPLIT_DISTANCES.some((d) => Math.abs(body[0].distance - d) <= d * 0.015)
    if ((same(body.map((l) => l.distance)) && standardDistance) || same(body.map((l) => l.elapsed_time))) return undefined
  }

  const pieces: Piece[] = []
  for (const l of laps) {
    if (isRest(l)) {
      const last = pieces.at(-1)
      if (last) last.restSec = (last.restSec ?? 0) + l.elapsed_time
      continue
    }
    pieces.push({
      id: newId(),
      distanceM: round(l.distance),
      durationSec: round(l.elapsed_time, 1),
      hrAvg: round(l.average_heartrate),
      hrMax: round(l.max_heartrate),
      watts: round(l.average_watts),
      rate: cadence(l.average_cadence, sport),
    })
  }
  // A cool-down after the last piece isn't rest between reps.
  if (pieces.length) delete pieces[pieces.length - 1].restSec
  return pieces.length >= 2 ? pieces : undefined
}

function sessionType(sport: Sport, a: StravaActivity, pieces?: Piece[], fallback?: string) {
  const wt = a.workout_type
  const offered = (v: string) => SPORTS[sport].types.some((t) => t.value === v)
  if ((wt === 1 || wt === 11) && offered('race')) return 'race'
  if (wt === 2 && offered('long')) return 'long'
  if (pieces?.length || wt === 3 || wt === 12) {
    if (offered('intervals')) return 'intervals'
    if (offered('pieces')) return 'pieces'
  }
  return fallback
}

export function toSession(a: StravaActivity): SessionDraft {
  const { sport, type, indoor } = stravaSport(a)
  const pieces = lapsToPieces(a.laps, sport)
  const race = a.workout_type === 1 || a.workout_type === 11
  const notes = [a.description, a.private_note].map((n) => n?.trim()).filter(Boolean).join('\n\n') || undefined
  const watts = a.average_watts && (a.device_watts || sport === 'erg') ? round(a.average_watts) : undefined
  return {
    sport,
    type: sessionType(sport, a, pieces, type),
    title: usefulTitle(a.name),
    date: a.start_date_local.slice(0, 10),
    startTime: a.start_date_local.slice(11, 19),
    // Moving time is what Strava shows; races are judged on the clock.
    durationSec: (race ? a.elapsed_time : a.moving_time || a.elapsed_time) || undefined,
    distanceM: a.distance > 0 ? round(a.distance) : undefined,
    elevationM: a.total_elevation_gain ? round(a.total_elevation_gain) : undefined,
    hrAvg: round(a.average_heartrate),
    hrMax: round(a.max_heartrate),
    rpe: a.perceived_exertion ? Math.min(10, Math.max(1, Math.round(a.perceived_exertion))) : undefined,
    watts,
    normWatts: a.weighted_average_watts && a.device_watts ? round(a.weighted_average_watts) : undefined,
    rate: cadence(a.average_cadence, sport),
    indoor,
    pieces,
    notes,
    status: 'completed',
    source: 'strava',
    externalId: String(a.id),
  }
}

const FILLABLE = ['type', 'title', 'startTime', 'durationSec', 'distanceM', 'elevationM', 'hrAvg', 'hrMax', 'rpe', 'watts', 'normWatts', 'rate', 'indoor', 'notes'] as const

/**
 * What Strava can add to a session without overwriting anything typed in by hand: empty
 * fields are filled, pieces are taken if there are none, and matching pieces get their
 * missing HR, watts and rate. Returns the changed session, or undefined if nothing changed.
 */
export function fillFrom(existing: Session, incoming: SessionDraft): Session | undefined {
  const next: Session = { ...existing, externalId: existing.externalId ?? incoming.externalId }
  let changed = next.externalId !== existing.externalId
  for (const key of FILLABLE) {
    if (existing[key] == null && incoming[key] != null) {
      ;(next as unknown as Record<string, unknown>)[key] = incoming[key]
      changed = true
    }
  }
  const mine = existing.pieces ?? []
  const theirs = incoming.pieces ?? []
  if (!mine.length && theirs.length && SPORTS[existing.sport].pieces) {
    next.pieces = theirs
    changed = true
  } else if (mine.length && mine.length === theirs.length) {
    next.pieces = mine.map((p, i) => {
      const t = theirs[i]
      const filled = { ...p, hrAvg: p.hrAvg ?? t.hrAvg, hrMax: p.hrMax ?? t.hrMax, watts: p.watts ?? t.watts, rate: p.rate ?? t.rate }
      if (filled.hrAvg !== p.hrAvg || filled.hrMax !== p.hrMax || filled.watts !== p.watts || filled.rate !== p.rate) changed = true
      return filled
    })
  }
  return changed ? next : undefined
}
