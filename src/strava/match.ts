import { clockToSec } from '../log/format'
import type { SessionDraft } from '../log/LogStore'
import type { Session, Sport } from '../log/types'
import type { PlannedSession } from '../plan/types'

// Deduping Strava activities against sessions logged by hand, and linking them to the plan.
//
// A manual session is a candidate for an activity when it's on the same day, in a
// compatible sport (erg and on-water count as the same, "other" is a weak match for
// anything), completed, not already linked to Strava, and nothing clearly contradicts it:
// start times over 3 hours apart, durations over 50% apart or distances over 25% apart.
// Close start times, durations and distances add to the score.
//
// Pairs are assigned best score first, each activity and session used once. A pair is
// merged automatically when the evidence is strong (score 3+) and clearly beats the next
// candidate for that activity (by 2+), or when it's the only candidate either way round
// and the sport matches. Anything else with a candidate waits
// for review; activities with no candidate are imported as new sessions.

export interface ReviewItem {
  activityId: string
  draft: SessionDraft
  candidateIds: string[]
}

export interface ImportPlan {
  create: SessionDraft[]
  merge: { sessionId: string; draft: SessionDraft }[]
  review: ReviewItem[]
}

const ROWING: Sport[] = ['row', 'erg']

function sportFit(a: Sport, b: Sport): 'same' | 'weak' | undefined {
  if (a === b || (ROWING.includes(a) && ROWING.includes(b))) return 'same'
  if (a === 'other' || b === 'other') return 'weak'
  return undefined
}

const relDiff = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b)

/** Score for an activity against a manual session, or undefined if they can't be the same thing. */
export function matchScore(activity: SessionDraft, s: Session): number | undefined {
  // Legs of a multisport event are matched as a whole event, not one by one.
  if (s.date !== activity.date || s.externalId || s.multisportId || s.status !== 'completed' || s.sport === 'transition') return undefined
  const fit = sportFit(activity.sport, s.sport)
  if (!fit) return undefined
  let score = fit === 'same' ? 1 : 0

  const t1 = clockToSec(activity.startTime)
  const t2 = clockToSec(s.startTime)
  if (t1 != null && t2 != null) {
    const min = Math.abs(t1 - t2) / 60
    if (min > 180) return undefined
    score += min <= 30 ? 2 : min <= 90 ? 1 : 0
  }
  if (activity.durationSec && s.durationSec) {
    const d = relDiff(activity.durationSec, s.durationSec)
    // Strength sessions are often started late or left running on the watch.
    if (d > 0.5 && s.sport !== 'strength') return undefined
    score += d <= 0.1 ? 2 : d <= 0.25 ? 1 : 0
  }
  if (activity.distanceM && s.distanceM) {
    const d = relDiff(activity.distanceM, s.distanceM)
    if (d > 0.25) return undefined
    score += d <= 0.03 ? 2 : d <= 0.1 ? 1 : 0
  }
  return score
}

export function planImport(drafts: SessionDraft[], sessions: Session[]): ImportPlan {
  const manual = sessions.filter((s) => !s.externalId)
  const pairs: { a: number; s: Session; score: number; fit: 'same' | 'weak' }[] = []
  drafts.forEach((d, a) => {
    for (const s of manual) {
      const score = matchScore(d, s)
      if (score != null) pairs.push({ a, s, score, fit: sportFit(d.sport, s.sport)! })
    }
  })
  pairs.sort((x, y) => y.score - x.score)

  const perActivity = (a: number) => pairs.filter((p) => p.a === a).length
  const runnerUp = (a: number, not: string) => pairs.find((p) => p.a === a && p.s.id !== not && !usedS.has(p.s.id))?.score ?? -Infinity
  const perSession = (id: string) => pairs.filter((p) => p.s.id === id).length
  const usedA = new Set<number>()
  const usedS = new Set<string>()
  const plan: ImportPlan = { create: [], merge: [], review: [] }

  for (const p of pairs) {
    if (usedA.has(p.a) || usedS.has(p.s.id)) continue
    const alone = perActivity(p.a) === 1 && perSession(p.s.id) === 1
    if ((p.score >= 3 && p.score - runnerUp(p.a, p.s.id) >= 2) || (alone && p.fit === 'same')) {
      usedA.add(p.a)
      usedS.add(p.s.id)
      plan.merge.push({ sessionId: p.s.id, draft: drafts[p.a] })
    }
  }
  drafts.forEach((d, a) => {
    if (usedA.has(a)) return
    const candidateIds = pairs.filter((p) => p.a === a && !usedS.has(p.s.id)).map((p) => p.s.id)
    if (candidateIds.length) plan.review.push({ activityId: d.externalId!, draft: d, candidateIds })
    else plan.create.push(d)
  })
  return plan
}

/**
 * The planned session an imported activity most likely carried out: the only one that day
 * in a compatible sport that isn't skipped or logged already. Two or more is ambiguous.
 */
export function plannedFor(d: SessionDraft, planned: PlannedSession[], loggedPlanIds: Set<string>): PlannedSession | undefined {
  const options = planned.filter((p) => p.date === d.date && !p.skipped && !loggedPlanIds.has(p.id) && sportFit(d.sport, p.sport) === 'same')
  return options.length === 1 ? options[0] : undefined
}
