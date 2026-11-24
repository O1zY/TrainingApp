import { describe, expect, it } from 'vitest'
import type { PlanEvent } from '../../plan/types'
import { presetLegs } from '../races'
import { EMPTY_PROFILE, type AthleteProfile } from '../types'
import { FINDINGS, SOURCES, coachContext, relevantFindings, shortCite, sourcesFor, type Design } from './index'

// The library's own rules: every claim traceable to a checked source, and evidence
// strength honest about the kind of studies behind it.

describe('research library integrity', () => {
  it('has unique ids', () => {
    expect(new Set(FINDINGS.map((f) => f.id)).size).toBe(FINDINGS.length)
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length)
    expect(new Set(SOURCES.map((s) => s.doi.toLowerCase())).size).toBe(SOURCES.length)
  })

  it('cites only sources that exist, and every source is cited', () => {
    const ids = new Set(SOURCES.map((s) => s.id))
    for (const f of FINDINGS) for (const id of f.sources) expect(ids.has(id), `${f.id} → ${id}`).toBe(true)
    const used = new Set(FINDINGS.flatMap((f) => f.sources))
    expect(SOURCES.filter((s) => !used.has(s.id)).map((s) => s.id)).toEqual([])
  })

  it('records sources with a valid DOI, PubMed id and plausible year', () => {
    for (const s of SOURCES) {
      expect(s.doi, s.id).toMatch(/^10\.\d{4,9}\/\S+$/)
      if (s.pmid) expect(s.pmid, s.id).toMatch(/^\d{6,9}$/)
      expect(s.year).toBeGreaterThanOrEqual(1980)
      expect(s.year).toBeLessThanOrEqual(new Date().getFullYear())
      expect(s.finding.length, s.id).toBeGreaterThan(40)
      // Six named authors at most, then "et al.".
      expect(s.authors.split(',').length, s.id).toBeLessThanOrEqual(7)
    }
  })

  it('grades strength no higher than the studies allow', () => {
    const pooled: Design[] = ['meta-analysis', 'systematic review']
    const experimental: Design[] = [...pooled, 'randomised trial', 'controlled trial']
    for (const f of FINDINGS) {
      const designs = sourcesFor(f).map((s) => s.design)
      if (f.strength === 'strong') expect(designs.some((d) => pooled.includes(d)), f.id).toBe(true)
      if (f.strength === 'moderate') expect(designs.some((d) => experimental.includes(d) || d === 'review'), f.id).toBe(true)
    }
  })

  it('gives every finding guidance and an honest caveat', () => {
    for (const f of FINDINGS) {
      expect(f.guidance.length, f.id).toBeGreaterThan(0)
      expect(f.caveats.length, f.id).toBeGreaterThan(20)
      expect(f.applies.length, f.id).toBeGreaterThan(0)
    }
  })
})

describe('shortCite', () => {
  it('names one, two or many authors', () => {
    const s = (authors: string) => shortCite({ ...SOURCES[0], authors, year: 2000 })
    expect(s('Walsh JA')).toBe('Walsh 2000')
    expect(s('Millet GP, Vleck VE')).toBe('Millet & Vleck 2000')
    expect(s('Bosquet L, Montpetit J, Arvisais D, Mujika I')).toBe('Bosquet et al. 2000')
  })
})

describe('relevantFindings', () => {
  const duathlon: PlanEvent = { id: 'd', kind: 'race', name: 'Spring duathlon', date: '2027-04-11', priority: 'A', multisport: 'duathlon', sport: 'run' }
  const profile: AthleteProfile = { ...EMPTY_PROFILE, goal: { eventId: 'd', legs: presetLegs('duathlon', 'sprint')! } }
  const ids = (ctx: ReturnType<typeof coachContext>) => relevantFindings(ctx).map((r) => r.finding.id)

  it('matches a duathlete with an A race and no injuries', () => {
    const ctx = coachContext(profile, [duathlon])
    expect(ctx).toMatchObject({ duathlon: true, triathlon: false, runs: true, aRace: true, injured: false })
    const got = ids(ctx)
    expect(got).toEqual(expect.arrayContaining(['mostly-easy', 'taper', 'bricks', 'duathlon-pacing', 'first-km', 'run-progression', 'heavy-strength']))
    expect(got).not.toContain('pain-monitoring')
    expect(got).not.toContain('hrv-guided')
  })

  it('adds injury, HRV and shift findings when they apply', () => {
    const hurt: AthleteProfile = { ...profile, injuries: [{ id: 'k', area: 'knee', status: 'current', aggravatedBy: ['running'], updatedAt: '' }] }
    const got = relevantFindings(coachContext(hurt, [duathlon], { hrv: true, shifts: true }))
    expect(got.map((r) => r.finding.id)).toEqual(expect.arrayContaining(['pain-monitoring', 'hrv-guided', 'plan-around-work']))
    expect(got.find((r) => r.finding.id === 'pain-monitoring')!.reasons).toEqual(['You have an injury or niggle'])
  })

  it('leaves out duathlon-only findings for a triathlon, and sorts strongest first', () => {
    const tri: PlanEvent = { ...duathlon, id: 't', multisport: 'triathlon', sport: 'swim', priority: 'B' }
    const got = relevantFindings(coachContext({ ...profile, goal: { eventId: 't', legs: presetLegs('triathlon', 'sprint')! } }, [tri]))
    expect(got.map((r) => r.finding.id)).not.toContain('duathlon-pacing')
    expect(got.map((r) => r.finding.id)).not.toContain('taper')
    const ranks = got.map((r) => ['strong', 'moderate', 'limited'].indexOf(r.finding.strength))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })

  it('works before the screening is started', () => {
    expect(ids(coachContext(undefined, []))).toEqual(expect.arrayContaining(['mostly-easy', 'sleep']))
  })
})
