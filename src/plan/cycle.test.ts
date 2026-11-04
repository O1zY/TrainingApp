import { describe, expect, it } from 'vitest'
import type { PlanEvent } from './types'
import { blockWeeks } from './cycle'

const block = { start: '2026-11-02', weeks: 8, buildWeeks: 3, progressionPct: 8, deloadPct: 60 }
const kinds = (events: PlanEvent[] = [], extra = {}) => blockWeeks({ ...block, ...extra }, events).map((w) => w.kind)
const race = (date: string, priority: 'A' | 'B' | 'C'): PlanEvent => ({ id: date, kind: 'race', name: 'Race', date, priority })

describe('blockWeeks', () => {
  it('runs 3 build weeks then a deload', () => {
    const weeks = blockWeeks(block, [])
    expect(weeks.map((w) => w.kind)).toEqual(['build', 'build', 'build', 'deload', 'build', 'build', 'build', 'deload'])
    expect(weeks.slice(0, 4).map((w) => w.volume)).toEqual([1, 1.08, 1.16, 0.6])
  })

  it('tapers before an A race and recovers after, then restarts the rhythm', () => {
    // Week 4 (index 4) holds the race.
    expect(kinds([race('2026-12-05', 'A')])).toEqual(['build', 'build', 'build', 'taper', 'race', 'recovery', 'build', 'build'])
  })

  it('skips a deload that falls just before a taper', () => {
    // A race in week 5: the deload due in week 4 (index 3) would sit before the taper.
    const k = kinds([race('2026-12-12', 'A')])
    expect(k.slice(0, 6)).toEqual(['build', 'build', 'build', 'build', 'taper', 'race'])
  })

  it('keeps the rhythm through a B race (pausing the build count) and trains through a C race', () => {
    expect(kinds([race('2026-11-11', 'B')])).toEqual(['build', 'race', 'build', 'build', 'deload', 'build', 'build', 'build'])
    expect(kinds([race('2026-11-11', 'C')])).toEqual(['build', 'build', 'build', 'deload', 'build', 'build', 'build', 'deload'])
  })

  it('makes a week away the deload', () => {
    const away: PlanEvent = { id: 'h', kind: 'away', name: 'Holiday', date: '2026-11-16', endDate: '2026-11-20' }
    expect(kinds([away]).slice(0, 4)).toEqual(['build', 'build', 'deload', 'build'])
  })

  it('lets a hand-set week win and counts on from it', () => {
    const weeks = blockWeeks({ ...block, weekKinds: { '2026-11-09': 'deload' } }, [])
    expect(weeks.slice(0, 3).map((w) => w.kind)).toEqual(['build', 'deload', 'build'])
    expect(weeks[1].overridden).toBe(true)
    expect(weeks[2].buildNo).toBe(1)
  })
})
