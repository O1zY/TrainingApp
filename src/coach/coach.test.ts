import { describe, expect, it } from 'vitest'
import type { Session, Wellbeing } from '../log/types'
import { DEFAULT_PREFS } from '../plan/data'
import type { Commitment, PlanEvent } from '../plan/types'
import { trainingHistory, workPattern } from './history'
import { formatsFor, presetLegs } from './races'
import { excluded, healthFlags, injuryFlags, progress } from './screening'
import { EMPTY_PROFILE, type AthleteProfile, type Injury } from './types'

let n = 0
const s = (p: Partial<Session>): Session => ({ id: String(++n), sport: 'run', date: '2026-11-02', status: 'completed', source: 'manual', createdAt: '', updatedAt: '', ...p })
const inj = (p: Partial<Injury>): Injury => ({ id: String(++n), area: 'knee', status: 'current', aggravatedBy: ['running'], updatedAt: '', ...p })

// Thursday; with Monday weeks the last whole week is 2–8 Nov.
const TODAY = '2026-11-12'

describe('trainingHistory', () => {
  it('averages the last whole weeks, leaving out the current one', () => {
    const h = trainingHistory(
      [
        s({ date: '2026-11-02', durationSec: 3600, distanceM: 10000 }),
        s({ date: '2026-11-04', durationSec: 5400, sport: 'bike', distanceM: 45000 }),
        s({ date: '2026-11-04', durationSec: 1800, distanceM: 5000 }),
        s({ date: '2026-11-10', durationSec: 9999 }), // this week: not counted
        s({ date: '2026-10-26', durationSec: 3600, status: 'planned' }),
      ],
      [],
      TODAY,
      1,
      2,
    )
    expect(h.from).toBe('2026-10-26')
    expect(h.to).toBe('2026-11-08')
    expect(h.hoursPerWeek).toBeCloseTo(3 / 2)
    expect(h.activeWeeks).toBe(1)
    expect(h.maxWeekHours).toBeCloseTo(3)
    expect(h.daysPerWeek).toBe(1)
    // 1.5h each: the tie goes to the sport done more often.
    expect(h.sports.map((x) => x.sport)).toEqual(['run', 'bike'])
    const run = h.sports.find((x) => x.sport === 'run')!
    expect(run.sessions).toBe(2)
    expect(run.kmPerWeek).toBeCloseTo(7.5)
    expect(run.longestSec).toBe(3600)
    expect(run.longestM).toBe(10000)
  })

  it('picks up niggles, injuries and recent illness from the log', () => {
    const w = (p: Partial<Wellbeing>): Wellbeing => ({ date: '2026-11-01', updatedAt: '', ...p })
    const h = trainingHistory(
      [s({ feel: ['Niggle'] }), s({ feel: ['Good'] })],
      [w({ injury: 'Left calf tight' }), w({ date: '2026-11-03', injury: 'Left calf tight' }), w({ date: '2026-11-05', illness: true }), w({ date: '2026-10-20', illness: true })],
      TODAY,
      1,
    )
    expect(h.niggleSessions).toBe(1)
    expect(h.injuryNotes).toEqual(['Left calf tight'])
    expect(h.recentIllDays).toBe(1)
  })
})

describe('workPattern', () => {
  const c = (date: string, start: string, end: string): Commitment => ({ id: date + start, date, start, end, kind: 'work', source: 'manual' })

  it('reads the usual shifts from the weeks ahead', () => {
    const shifts = ['2026-11-09', '2026-11-16'].flatMap((mon) => [c(mon, '06:00', '14:00'), c(mon.replace(/\d\d$/, (d) => String(+d + 2)), '13:00', '22:00')])
    const p = workPattern(shifts, DEFAULT_PREFS, TODAY, 1, 2)
    expect(p.source).toBe('ahead')
    expect(p.hoursPerWeek).toBeCloseTo(17)
    expect(p.shiftsPerWeek).toBe(2)
    expect(p.daysOffPerWeek).toBe(5)
    const monday = p.days.find((d) => d.day === 1)!
    expect(monday).toMatchObject({ share: 1, start: '06:00', end: '14:00' })
    expect(p.earlyStarts).toBe(2)
    expect(p.lateFinishes).toBe(2)
  })

  it('falls back to past weeks, then to nothing', () => {
    expect(workPattern([c('2026-11-03', '09:00', '17:00')], DEFAULT_PREFS, TODAY, 1, 2).source).toBe('past')
    expect(workPattern([], DEFAULT_PREFS, TODAY, 1, 2).source).toBe('none')
  })
})

describe('races', () => {
  it('fills standard legs and offers only the formats that exist', () => {
    expect(presetLegs('duathlon', 'sprint')).toEqual([
      { sport: 'run', distanceM: 5000 },
      { sport: 'bike', distanceM: 20000 },
      { sport: 'run', distanceM: 2500 },
    ])
    expect(formatsFor('duathlon')).not.toContain('long')
    expect(formatsFor('triathlon')).toContain('long')
    expect(presetLegs('triathlon', 'other')).toBeUndefined()
  })
})

describe('screening flags', () => {
  it('sends any health yes to the GP', () => {
    expect(healthFlags({ heart: false, chestPain: false })).toEqual([])
    expect(healthFlags({ chestPain: true })[0].level).toBe('stop')
    expect(healthFlags({ recentIllness: true })[0].level).toBe('caution')
  })

  it('plans around a mild, seen niggle', () => {
    const f = injuryFlags(inj({ painInSport: 3, seenBy: 'physio' }))
    expect(f).toHaveLength(1)
    expect(f[0].level).toBe('caution')
  })

  it('stops on warning signs or high pain, and on an unseen painful injury', () => {
    expect(injuryFlags(inj({ painAtRest: true, seenBy: 'physio' }))[0].level).toBe('stop')
    expect(injuryFlags(inj({ worsening: true, seenBy: 'physio' }))[0].level).toBe('stop')
    expect(injuryFlags(inj({ painInSport: 6, seenBy: 'physio' }))[0].level).toBe('stop')
    expect(injuryFlags(inj({ painInSport: 4 }))[0].level).toBe('stop')
    expect(injuryFlags(inj({ painInSport: 2 }))[0].level).toBe('caution')
  })

  it('ignores past injuries and lets clearance override high pain', () => {
    expect(injuryFlags(inj({ status: 'past', painAtRest: true }))).toEqual([])
    expect(injuryFlags(inj({ status: 'recovering', painInSport: 6, cleared: true, seenBy: 'physio' }))[0].level).toBe('caution')
  })

  it('keeps out what sets off a stopped injury only', () => {
    const profile: AthleteProfile = {
      ...EMPTY_PROFILE,
      injuries: [inj({ painAtRest: true, aggravatedBy: ['running', 'hills'] }), inj({ painInSport: 1, seenBy: 'physio', aggravatedBy: ['cycling'] })],
    }
    expect(excluded(profile)).toEqual(['running', 'hills'])
  })
})

describe('progress', () => {
  const race: PlanEvent = { id: 'r', kind: 'race', name: 'Spring duathlon', date: '2027-04-04', priority: 'A', multisport: 'duathlon', sport: 'run' }

  it('counts finished sections and lists what is missing', () => {
    const blank = progress(EMPTY_PROFILE, [race], TODAY)
    expect(blank.done).toBe(0)
    expect(blank.missing.goal).toContain('pick the race')

    const full: AthleteProfile = {
      ...EMPTY_PROFILE,
      goal: { eventId: 'r', legs: presetLegs('duathlon', 'sprint')!, aim: 'qualify', experience: 'some' },
      health: { heart: false, chestPain: false, dizziness: false, chronicCondition: false, medication: false, boneJoint: false, supervisedOnly: false },
      injuriesChecked: true,
      historyChecked: true,
      availability: { daysPerWeek: 6, hoursPerWeek: 9 },
      equipment: ['turbo trainer'],
    }
    expect(progress(full, [race], TODAY).complete).toBe(true)
    expect(progress(full, [{ ...race, date: '2026-10-04' }], TODAY).missing.goal).toEqual(['the race has passed: pick the next one'])
    expect(progress({ ...full, goal: { ...full.goal, legs: presetLegs('triathlon', 'sprint')! } }, [race], TODAY).missing.history).toEqual(['swimming level'])
  })
})
