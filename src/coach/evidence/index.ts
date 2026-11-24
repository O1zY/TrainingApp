import type { PlanEvent } from '../../plan/types'
import type { AthleteProfile } from '../types'
import { FINDINGS } from './findings'
import { SOURCES } from './sources'
import type { Applies, Finding, Source, Strength } from './types'

export { FINDINGS, SOURCES }
export type * from './types'

const byId = new Map(SOURCES.map((s) => [s.id, s]))

export const sourceById = (id: string) => byId.get(id)
export const sourcesFor = (f: Finding) => f.sources.map((id) => byId.get(id)).filter((s): s is Source => !!s)

/** "Bosquet et al. 2007" / "Millet & Vleck 2000" / "Walsh 2019". */
export function shortCite(s: Source) {
  const surnames = s.authors.split(',').map((a) => a.trim().split(' ')[0])
  const who = surnames.length === 1 ? surnames[0] : surnames.length === 2 && !s.authors.includes('et al') ? `${surnames[0]} & ${surnames[1]}` : `${surnames[0]} et al.`
  return `${who} ${s.year}`
}

export const doiUrl = (s: Source) => `https://doi.org/${s.doi}`
export const pubmedUrl = (s: Source) => (s.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${s.pmid}/` : undefined)

export const STRENGTH_LABEL: Record<Strength, string> = {
  strong: 'Strong evidence',
  moderate: 'Moderate evidence',
  limited: 'Limited evidence',
}

/** What about the athlete makes a finding relevant, worked out from the screening. */
export interface CoachContext {
  duathlon: boolean
  triathlon: boolean
  runs: boolean
  injured: boolean
  lifts: boolean
  hrv: boolean
  shifts: boolean
  aRace: boolean
}

export function coachContext(profile: AthleteProfile | undefined, events: PlanEvent[], extra: { hrv?: boolean; shifts?: boolean } = {}): CoachContext {
  const race = events.find((e) => e.id === profile?.goal.eventId)
  const legs = profile?.goal.legs.map((l) => l.sport) ?? []
  const triathlon = race?.multisport === 'triathlon' || (legs.includes('swim') && legs.includes('bike') && legs.includes('run'))
  const duathlon = race?.multisport === 'duathlon' || (!legs.includes('swim') && legs.filter((s) => s === 'run').length >= 2 && legs.includes('bike'))
  return {
    duathlon,
    triathlon,
    runs: legs.includes('run') || race?.sport === 'run',
    injured: !!profile?.injuries.some((i) => i.status !== 'past'),
    lifts: !!profile && (profile.keep.some((k) => k.sport === 'strength') || profile.equipment.includes('gym')),
    hrv: !!extra.hrv,
    shifts: !!extra.shifts,
    aRace: race?.priority === 'A',
  }
}

const WHY: Record<Applies, (c: CoachContext) => string | undefined> = {
  endurance: () => 'Applies to every endurance plan',
  multisport: (c) => (c.duathlon || c.triathlon ? `Your goal is a ${c.triathlon ? 'triathlon' : 'duathlon'}` : undefined),
  duathlon: (c) => (c.duathlon ? 'Your goal is a duathlon' : undefined),
  triathlon: (c) => (c.triathlon ? 'Your goal is a triathlon' : undefined),
  run: (c) => (c.runs ? 'Your race includes running' : undefined),
  injury: (c) => (c.injured ? 'You have an injury or niggle' : undefined),
  strength: (c) => (c.lifts ? 'You lift or have gym access' : undefined),
  hrv: (c) => (c.hrv ? 'You log HRV in check-ins' : undefined),
  shifts: (c) => (c.shifts ? 'You train around shifts' : undefined),
  'a-race': (c) => (c.aRace ? 'Your goal is an A race' : undefined),
}

export interface Relevant {
  finding: Finding
  reasons: string[]
}

const RANK: Record<Strength, number> = { strong: 0, moderate: 1, limited: 2 }

/** The findings that apply to this athlete, strongest evidence first, each with why it applies. */
export function relevantFindings(ctx: CoachContext, findings: Finding[] = FINDINGS): Relevant[] {
  return findings
    .map((finding) => ({ finding, reasons: [...new Set(finding.applies.map((a) => WHY[a](ctx)).filter((r): r is string => !!r))] }))
    .filter((r) => r.reasons.length)
    .sort((a, b) => RANK[a.finding.strength] - RANK[b.finding.strength])
}
