import { describe, expect, it } from 'vitest'
import { blockWeeks } from '../plan/cycle'
import type { PlanEvent } from '../plan/types'
import { FINDINGS } from './evidence'
import type { TrainingHistory, WorkPattern } from './history'
import { presetLegs } from './races'
import { brickWorkouts, coachPlan, type CoachInput, type Proposal } from './rules'
import { EMPTY_PROFILE, type AthleteProfile } from './types'

const TODAY = '2026-11-24' // Tuesday; next training week starts Mon 30 Nov
const RACE: PlanEvent = { id: 'r', kind: 'race', name: 'Thruxton Duathlon', date: '2027-04-04', priority: 'A', multisport: 'duathlon', sport: 'run' }

const history = (p: Partial<TrainingHistory> = {}): TrainingHistory => ({
  from: '2026-08-31',
  to: '2026-11-22',
  weeks: 12,
  activeWeeks: 12,
  hoursPerWeek: 5,
  recentHoursPerWeek: 5.5,
  maxWeekHours: 6.5,
  daysPerWeek: 4.5,
  sports: [
    { sport: 'run', sessions: 30, sessionsPerWeek: 2.5, hoursPerWeek: 2, kmPerWeek: 22, longestSec: 4500, lastDate: '2026-11-20' },
    { sport: 'bike', sessions: 18, sessionsPerWeek: 1.5, hoursPerWeek: 2.2, lastDate: '2026-11-21' },
  ],
  multisport: 0,
  missingRpe: 0,
  niggleSessions: 0,
  injuryNotes: [],
  recentIllDays: 0,
  ...p,
})
const WORK: WorkPattern = { source: 'ahead', from: '2026-11-23', to: '2026-12-20', weeks: 4, hoursPerWeek: 30, shiftsPerWeek: 4, daysOffPerWeek: 3, days: [], earlyStarts: 4, lateFinishes: 4, nights: 0 }

const profile = (p: Partial<AthleteProfile> = {}): AthleteProfile => ({
  ...EMPTY_PROFILE,
  goal: { eventId: 'r', format: 'sprint', legs: presetLegs('duathlon', 'sprint')!, aim: 'qualify', experience: 'some' },
  health: { heart: false, chestPain: false, dizziness: false, chronicCondition: false, medication: false, boneJoint: false, supervisedOnly: false },
  injuriesChecked: true,
  historyChecked: true,
  trainingYears: 12,
  availability: { daysPerWeek: 6, hoursPerWeek: 9, weekdayMaxMin: 75, dayOffMaxMin: 180, doubles: true, restDay: 5 },
  equipment: ['road bike', 'turbo trainer', 'gym'],
  keep: [{ sport: 'row', sessions: 1 }],
  ...p,
})

const run = (over: Partial<CoachInput> = {}) => coachPlan({ profile: profile(), events: [RACE], history: history(), work: WORK, today: TODAY, weekStartsOn: 1, ...over })
const ok = (r: ReturnType<typeof coachPlan>): Proposal => {
  if (!r.ok) throw new Error(r.missing.join('; '))
  return r.proposal
}
const sport = (p: Proposal, s: string) => p.block.sports.find((x) => x.sport === s)

describe('coachPlan for a duathlete', () => {
  const p = ok(run())

  it('runs from next Monday through race week and a recovery week', () => {
    expect(p.block.start).toBe('2026-11-30')
    // Race on 4 Apr is in week index 17 (from 30 Nov), plus the recovery week.
    expect(p.block.weeks).toBe(19)
    const weeks = blockWeeks(p.block, [RACE])
    expect(weeks.at(-2)!.kind).toBe('race')
    expect(weeks.at(-1)!.kind).toBe('recovery')
    expect(weeks.at(-3)!.kind).toBe('taper')
  })

  it('keeps a sprint taper to one week', () => {
    expect(p.block.weekKinds).toBeUndefined()
  })

  it('starts near recent volume and peaks inside the limit', () => {
    expect(p.startHours).toBeGreaterThanOrEqual(5.5)
    expect(p.peakHours).toBeLessThanOrEqual(9)
    const vols = blockWeeks(p.block, [RACE]).map((w) => w.volume)
    expect(p.startHours * Math.max(...vols)).toBeLessThanOrEqual(9.05)
    expect(p.block.buildWeeks).toBe(3)
    expect(p.block.progressionPct).toBe(8)
  })

  it('has run, bike, kept rowing and strength, mostly easy', () => {
    expect(p.block.sports.map((s) => s.sport)).toEqual(['run', 'bike', 'row', 'strength'])
    const hard = p.block.sports.filter((s) => s.sport !== 'strength').reduce((a, s) => a + s.key, 0)
    expect(hard).toBe(p.startHours < 6 ? 2 : 3)
    // Current run + bike time (4.2h) is kept, with rowing and strength added on top.
    expect(p.startHours).toBeGreaterThanOrEqual(4.2 + (45 + 90) / 60)
    expect(sport(p, 'row')!.key).toBe(0)
    expect(sport(p, 'bike')!.key).toBe(1)
    expect(sport(p, 'strength')).toMatchObject({ sessions: 2, key: 1 })
    for (const s of p.block.sports) expect(s.key).toBeLessThan(s.sessions)
  })

  it('caps easy sessions to the time available', () => {
    for (const s of [sport(p, 'bike')!, sport(p, 'run')!]) {
      expect(s.easyMin).toBeGreaterThanOrEqual(20)
      expect(s.easyMin).toBeLessThanOrEqual(75) // work-day limit
      // A long session only when it's really long, and it fits a day off.
      if (s.long) expect(s.easyMin * 1.5).toBeGreaterThanOrEqual(s.sport === 'bike' ? 60 : 45)
      expect(s.easyMin * (s.long ? 1.5 : 1)).toBeLessThanOrEqual(180)
    }
    expect(sport(p, 'run')!.sessions).toBe(3)
  })

  it('adds three bricks, the last a duathlon simulation sized from the race', () => {
    expect(p.bricks).toHaveLength(3)
    expect(p.bricks.every((b) => b.sport === 'bike' && b.rpe! >= 7 && b.tags.includes('brick'))).toBe(true)
    expect(p.bricks[2].name).toBe('Duathlon simulation: 3km / 10km / 2.5km')
  })

  it('backs every decision with findings that exist, or marks it as judgement', () => {
    const ids = new Set(FINDINGS.map((f) => f.id))
    for (const d of p.decisions) {
      for (const f of d.findings) expect(ids.has(f), f).toBe(true)
      expect(d.findings.length > 0 || d.judgement, d.area).toBe(true)
    }
    const used = new Set(p.decisions.flatMap((d) => d.findings))
    for (const f of ['mostly-easy', 'taper', 'bricks', 'duathlon-pacing', 'heavy-strength', 'run-progression', 'sleep']) expect(used.has(f), f).toBe(true)
  })
})

describe('coachPlan limits', () => {
  it('waits for a finished screening', () => {
    const r = run({ profile: profile({ injuriesChecked: false }) })
    expect(r.ok).toBe(false)
    expect(run({ profile: undefined }).ok).toBe(false)
  })

  it('plans no hard sessions after a health yes', () => {
    const p = ok(run({ profile: profile({ health: { ...profile().health, chestPain: true } }) }))
    expect(p.block.sports.every((s) => s.key === 0)).toBe(true)
    expect(p.bricks).toEqual([])
    expect(p.warnings.join(' ')).toMatch(/GP/)
  })

  it('takes running out for an injury that needs a physio, and slows the build', () => {
    const knee = { id: 'k', area: 'knee' as const, status: 'current' as const, nightPain: true, aggravatedBy: ['running' as const], updatedAt: '' }
    const p = ok(run({ profile: profile({ injuries: [knee] }) }))
    expect(sport(p, 'run')).toBeUndefined()
    expect(sport(p, 'bike')).toBeDefined()
    expect(p.bricks).toEqual([])
    expect(p.block.buildWeeks).toBe(2)
    expect(p.block.progressionPct).toBe(5)
    expect(p.warnings.join(' ')).toMatch(/physio/)
  })

  it('keeps running speed work out for a hill-sensitive niggle', () => {
    const calf = { id: 'c', area: 'calf' as const, status: 'current' as const, painInSport: 2, seenBy: 'physio' as const, aggravatedBy: ['hills' as const, 'speed work' as const], updatedAt: '' }
    const p = ok(run({ profile: profile({ injuries: [calf] }) }))
    expect(sport(p, 'run')!.key).toBe(0)
    expect(sport(p, 'run')!.sessions).toBeGreaterThan(0)
  })

  it('builds a base block for a race more than 20 weeks out', () => {
    const p = ok(run({ events: [{ ...RACE, date: '2027-08-29' }] }))
    expect(p.block.weeks).toBe(12)
    expect(p.warnings.join(' ')).toMatch(/base block/)
  })

  it('uses a two-week taper for a standard-distance A race', () => {
    const p = ok(run({ profile: profile({ goal: { ...profile().goal, format: 'standard', legs: presetLegs('duathlon', 'standard')! } }) }))
    expect(Object.values(p.block.weekKinds ?? {})).toEqual(['taper'])
    const weeks = blockWeeks(p.block, [RACE])
    expect(weeks.at(-4)!.kind).toBe('taper')
    expect(weeks.at(-3)!.kind).toBe('taper')
  })

  it('adds swimming for a triathlon, and starts cautiously with no history', () => {
    const tri: PlanEvent = { ...RACE, multisport: 'triathlon', sport: 'swim' }
    const p = ok(run({ events: [tri], history: history({ sports: [], hoursPerWeek: 0, recentHoursPerWeek: 0, activeWeeks: 0 }), profile: profile({ goal: { ...profile().goal, legs: presetLegs('triathlon', 'sprint')! }, swimLevel: 'continuous' }) }))
    expect(p.block.sports.map((s) => s.sport)).toEqual(expect.arrayContaining(['swim', 'bike', 'run']))
    expect(p.startHours).toBeCloseTo(5.4, 1) // 60% of the 9h limit with nothing logged
    expect(sport(p, 'run')!.easyMin).toBeLessThanOrEqual(30)
    expect(p.block.progressionPct).toBe(5)
    expect(p.bricks[2].name).toMatch(/^Race-pace brick/)
  })
})

describe('brickWorkouts', () => {
  it('falls back to sprint distances when legs are missing', () => {
    expect(brickWorkouts([], true)[2].name).toBe('Duathlon simulation: 3km / 10km / 5km')
  })
})
