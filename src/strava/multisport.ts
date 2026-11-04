import type { Multisport, MultisportKind, Session, Sport } from '../log/types'
import type { PlanEvent } from '../plan/types'
import type { StravaActivity } from './api'
import { stravaSport } from './convert'

// Watches usually upload a duathlon or triathlon to Strava as one activity per leg, with the
// transitions left out. Legs on the same day that follow each other closely, in race order,
// are grouped back into one multisport event so the app can show the legs and work out the
// transitions from the gaps.

/** Longest gap between one leg finishing and the next starting. */
export const MAX_GAP_SEC = 15 * 60

const PATTERNS: { kind: MultisportKind; legs: Sport[] }[] = [
  { kind: 'triathlon', legs: ['swim', 'bike', 'run'] },
  { kind: 'duathlon', legs: ['run', 'bike', 'run'] },
]

export interface LegGroup {
  kind: MultisportKind
  /** Indexes into the activity list, in race order. */
  legs: number[]
}

const clock = (local: string) => {
  const [h, m, s] = local.slice(11, 19).split(':').map(Number)
  return h * 3600 + m * 60 + (s || 0)
}

/**
 * Finds duathlons (run, bike, run) and triathlons (swim, bike, run) among the activities.
 * Activities are chained when each starts within MAX_GAP_SEC of the last one finishing
 * (by clock time, so pauses count). A chain can hold other activities too, such as a
 * warm-up jog just before the start; the race order is looked for inside it.
 */
export function findMultisport(activities: StravaActivity[]): LegGroup[] {
  const order = activities
    .map((a, i) => ({ i, date: a.start_date_local.slice(0, 10), start: clock(a.start_date_local), end: clock(a.start_date_local) + a.elapsed_time, sport: stravaSport(a).sport }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)

  const chains: (typeof order)[] = []
  for (const a of order) {
    const chain = chains.at(-1)
    const prev = chain?.at(-1)
    const gap = prev && prev.date === a.date ? a.start - prev.end : Infinity
    // A minute's overlap is allowed: watches round start and finish times.
    if (chain && gap >= -60 && gap <= MAX_GAP_SEC) chain.push(a)
    else chains.push([a])
  }

  const groups: LegGroup[] = []
  for (const chain of chains) {
    let at = 0
    while (at < chain.length) {
      const hit = PATTERNS.find((p) => p.legs.every((sport, k) => chain[at + k]?.sport === sport))
      if (hit) {
        groups.push({ kind: hit.kind, legs: chain.slice(at, at + hit.legs.length).map((x) => x.i) })
        at += hit.legs.length
      } else at++
    }
  }
  return groups
}

/**
 * An event logged by hand that these legs are: same day and kind, nothing linked to Strava
 * yet, and the same sports in the same order once transition legs are set aside.
 * Returns its legs in race order, lined up with the group's.
 */
export function manualEventFor(date: string, g: LegGroup, sports: Sport[], multisport: Multisport[], sessions: Session[]): { event: Multisport; legs: Session[] } | undefined {
  for (const event of multisport) {
    if (event.date !== date || event.kind !== g.kind) continue
    const legs = event.legIds.map((id) => sessions.find((s) => s.id === id)).filter((s): s is Session => !!s && s.sport !== 'transition')
    if (legs.some((l) => l.externalId) || legs.length !== sports.length || legs.some((l, k) => l.sport !== sports[k])) continue
    return { event, legs }
  }
  return undefined
}

/** The race in the plan this is likely to be: a race that day of the same kind. */
export function raceFor(date: string, kind: MultisportKind, events: PlanEvent[]) {
  return events.find((e) => e.kind === 'race' && e.date === date && e.multisport === kind)
}
