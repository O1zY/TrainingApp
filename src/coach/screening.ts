import type { PlanEvent } from '../plan/types'
import type { Aggravator, AthleteProfile, HealthScreen, Injury } from './types'

// The checks the screening runs before any plan is built. Deliberately cautious: the coach
// can plan around a niggle, but anything that sounds like more than a niggle, or a general
// health "yes", means seeing someone first. Nothing here diagnoses.

export type FlagLevel = 'stop' | 'caution'

export interface Flag {
  level: FlagLevel
  text: string
}

/** The general health questions, worded after the PAR-Q+ (the standard pre-exercise screen). */
export const HEALTH_QUESTIONS: { key: keyof Omit<HealthScreen, 'notes' | 'recentIllness'>; text: string }[] = [
  { key: 'heart', text: 'Has a doctor ever said you have a heart condition or high blood pressure?' },
  { key: 'chestPain', text: 'Do you get chest pain at rest, in daily life or when you exercise?' },
  { key: 'dizziness', text: 'Have you lost balance from dizziness, or lost consciousness, in the last 12 months?' },
  { key: 'chronicCondition', text: 'Have you been diagnosed with another long-term condition (e.g. asthma, diabetes)?' },
  { key: 'medication', text: 'Are you taking prescribed medication for a long-term condition?' },
  { key: 'boneJoint', text: 'Do you have a bone, joint or soft-tissue problem that harder training could make worse?' },
  { key: 'supervisedOnly', text: 'Has a doctor said you should only exercise under medical supervision?' },
]

export function healthFlags(h: HealthScreen): Flag[] {
  const out: Flag[] = []
  const yes = HEALTH_QUESTIONS.filter((q) => h[q.key])
  if (yes.length)
    out.push({
      level: 'stop',
      text: `You answered yes to ${yes.length === 1 ? 'a health question' : `${yes.length} health questions`}. Check with your GP that hard training is fine before the coach plans intensity.`,
    })
  if (h.recentIllness) out.push({ level: 'caution', text: 'Ill in the last two weeks: the plan starts with an easy week and no hard sessions until you feel fully back.' })
  return out
}

// A pain-monitoring approach (as in Silbernagel et al. 2007, Am J Sports Med, on Achilles
// tendinopathy) lets training carry on with pain up to about 5/10 that settles by the next
// morning. Above that, or with any warning sign, the screening asks for a professional first.
const PAIN_LIMIT = 5

export function injuryFlags(i: Injury): Flag[] {
  if (i.status === 'past') return []
  const where = [i.side && i.side !== 'both' ? i.side : '', i.area].filter(Boolean).join(' ')
  const reasons = [
    i.painAtRest && 'pain at rest',
    i.nightPain && 'pain at night',
    i.worsening && 'getting worse',
    i.otherSymptoms && 'swelling, numbness or giving way',
    !i.cleared && (i.painInSport ?? 0) > PAIN_LIMIT && `pain of ${i.painInSport}/10 when training`,
  ].filter((x): x is string => !!x)
  const unseen = !i.seenBy || i.seenBy === 'nobody'

  if (reasons.length)
    return [
      {
        level: 'stop',
        text: `${cap(where)}: ${reasons.join(', ')}. ${unseen ? 'See a physio or GP' : 'Check back with whoever is treating it'} before training through it; the coach leaves out ${aggravatorText(i)} until it's cleared.`,
      },
    ]
  if (unseen && i.status === 'current' && (i.painInSport ?? 0) >= 3)
    return [{ level: 'stop', text: `${cap(where)}: painful when training and not looked at yet. Worth a physio's opinion before a new block; until then the coach leaves out ${aggravatorText(i)}.` }]
  if (i.cleared && i.status === 'recovering') return [{ level: 'caution', text: `${cap(where)}: cleared, so the coach builds ${aggravatorText(i)} back gradually.` }]
  return [{ level: 'caution', text: `${cap(where)}: the coach plans around it, with less ${aggravatorText(i)} and a slower build${i.advice ? ', following your physio’s advice' : ''}.` }]
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "Left knee", "Lower back (both sides)". */
export function injuryTitle(i: Pick<Injury, 'area' | 'side'>) {
  return cap([i.side && i.side !== 'both' ? i.side : '', i.area, i.side === 'both' ? '(both sides)' : ''].filter(Boolean).join(' '))
}
const aggravatorText = (i: Injury) => (i.aggravatedBy.length ? i.aggravatedBy.join(', ') : 'whatever sets it off')

/** What the coach must keep out of the plan for now: everything that sets off an injury flagged stop. */
export function excluded(profile: AthleteProfile): Aggravator[] {
  const out = new Set<Aggravator>()
  for (const i of profile.injuries) if (injuryFlags(i).some((f) => f.level === 'stop')) i.aggravatedBy.forEach((a) => out.add(a))
  return [...out]
}

export function allFlags(profile: AthleteProfile): Flag[] {
  return [...healthFlags(profile.health), ...profile.injuries.flatMap(injuryFlags)]
}

export type SectionKey = 'goal' | 'health' | 'injuries' | 'history' | 'availability' | 'equipment'

export const SECTIONS: { key: SectionKey; title: string }[] = [
  { key: 'goal', title: 'Goal race' },
  { key: 'health', title: 'Health check' },
  { key: 'injuries', title: 'Injuries & niggles' },
  { key: 'history', title: 'Training history' },
  { key: 'availability', title: 'Time to train' },
  { key: 'equipment', title: 'Kit & facilities' },
]

/** What's still missing from each section; an empty list means the section is done. */
export function missing(profile: AthleteProfile, events: PlanEvent[], today: string): Record<SectionKey, string[]> {
  const g = profile.goal
  const race = events.find((e) => e.id === g.eventId)
  const swims = g.legs.some((l) => l.sport === 'swim')
  return {
    goal: [
      !race && 'pick the race',
      race && race.date < today && 'the race has passed: pick the next one',
      (!g.legs.length || g.legs.some((l) => !(l.distanceM > 0))) && 'leg distances',
      !g.aim && 'what you’re aiming for',
      !g.experience && 'experience at this kind of race',
    ].filter((x): x is string => !!x),
    health: HEALTH_QUESTIONS.some((q) => profile.health[q.key] == null) ? ['answer every question'] : [],
    injuries: profile.injuriesChecked ? [] : ['confirm the list (or that there are none)'],
    history: [!profile.historyChecked && 'check the summary', swims && !profile.swimLevel && 'swimming level'].filter((x): x is string => !!x),
    availability: [!profile.availability.daysPerWeek && 'days a week', !profile.availability.hoursPerWeek && 'hours a week'].filter((x): x is string => !!x),
    equipment: profile.equipment.length ? [] : ['what you have access to'],
  }
}

export function progress(profile: AthleteProfile, events: PlanEvent[], today: string) {
  const m = missing(profile, events, today)
  const done = SECTIONS.filter((s) => !m[s.key].length).length
  return { done, total: SECTIONS.length, complete: done === SECTIONS.length, missing: m }
}
