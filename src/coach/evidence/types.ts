// The coach's research library: findings it may build a plan from, each backed by
// published studies. Every source was checked against the paper index and its abstract
// before going in (see docs/SPEC.md, section 11b); nothing here is from memory alone.

/** How the study was done, strongest first. */
export type Design =
  | 'meta-analysis'
  | 'systematic review'
  | 'randomised trial'
  | 'controlled trial'
  | 'cohort'
  | 'cross-sectional'
  | 'review'

/** How much weight a finding can bear, from its sources taken together. */
export type Strength = 'strong' | 'moderate' | 'limited'

export type Topic =
  | 'intensity'
  | 'intervals'
  | 'taper'
  | 'transition'
  | 'pacing'
  | 'strength'
  | 'load'
  | 'injury'
  | 'recovery'
  | 'monitoring'
  | 'periodisation'

/**
 * Who a finding is for. `endurance` applies to everyone; the rest match the athlete
 * profile (race format, injuries, lifting, HRV check-ins, shift work, an A race).
 */
export type Applies = 'endurance' | 'multisport' | 'duathlon' | 'triathlon' | 'run' | 'injury' | 'strength' | 'hrv' | 'shifts' | 'a-race'

/** Which part of the plan a finding shapes, so the coach can say where it was used. */
export type Shapes = 'intensity mix' | 'key sessions' | 'taper' | 'bricks' | 'race pacing' | 'strength work' | 'progression' | 'deloads' | 'session order' | 'daily adjustments' | 'injury limits'

export interface Source {
  id: string
  /** "Bosquet L, Montpetit J, Arvisais D, Mujika I" (first six, then "et al."). */
  authors: string
  year: number
  title: string
  journal: string
  /** "39(8):1358–1365" where known. */
  ref?: string
  doi: string
  pmid?: string
  design: Design
  /** Who was studied, e.g. "10 highly trained male triathletes". */
  population: string
  /** What this paper found, with its numbers, in plain words. */
  finding: string
}

export interface Finding {
  id: string
  topic: Topic
  title: string
  /** One or two plain sentences: what the research says. */
  summary: string
  /** What the coach should do with it, with numbers. */
  guidance: string[]
  /** Where it doesn't hold, or what's uncertain. Shown alongside the guidance. */
  caveats: string
  strength: Strength
  applies: Applies[]
  shapes: Shapes[]
  /** Source ids, strongest first. */
  sources: string[]
}
