import { describe, expect, it } from 'vitest'
import { equal, merge, mergeStores } from './merge'

const s = (id: string, x: Record<string, unknown> = {}) => ({ id, updatedAt: '2026-11-01T10:00:00Z', ...x })

describe('equal', () => {
  it('compares deeply and ignores undefined fields', () => {
    expect(equal({ a: [1, { b: 2 }], c: undefined }, { a: [1, { b: 2 }] })).toBe(true)
    expect(equal({ a: [1, 2] }, { a: [2, 1] })).toBe(false)
  })
})

describe('mergeStores with a base', () => {
  const base = { sessions: [s('1', { rpe: 5 }), s('2'), s('3')], prefs: { units: 'metric', week: 1 } }

  it('keeps sessions added on both devices', () => {
    const local = { ...base, sessions: [...base.sessions, s('phone')] }
    const remote = { ...base, sessions: [...base.sessions, s('laptop')] }
    expect(mergeStores(base, local, remote).sessions).toEqual([...base.sessions, s('phone'), s('laptop')])
  })

  it('deletes on one side carry over, unless the other side edited the record', () => {
    const local = { ...base, sessions: [s('1', { rpe: 5 }), s('3')] } // deleted 2
    const remote = { ...base, sessions: [s('1', { rpe: 5 }), s('2'), s('3', { rpe: 9, updatedAt: '2026-11-02T00:00:00Z' })] }
    expect(mergeStores(base, local, remote).sessions).toEqual([s('1', { rpe: 5 }), s('3', { rpe: 9, updatedAt: '2026-11-02T00:00:00Z' })])

    const remoteEdits2 = { ...base, sessions: [s('1', { rpe: 5 }), s('2', { notes: 'kept' }), s('3')] }
    expect(mergeStores(base, local, remoteEdits2).sessions.map((x: { id: string }) => x.id)).toEqual(['1', '3', '2'])
  })

  it('merges different fields of the same record, and the later edit wins a clash', () => {
    const local = { ...base, sessions: [s('1', { rpe: 6, notes: 'windy', updatedAt: '2026-11-03T00:00:00Z' }), s('2'), s('3')] }
    const remote = { ...base, sessions: [s('1', { rpe: 7, hr: 150, updatedAt: '2026-11-02T00:00:00Z' }), s('2'), s('3')] }
    expect(mergeStores(base, local, remote).sessions[0]).toEqual(s('1', { rpe: 6, notes: 'windy', hr: 150, updatedAt: '2026-11-03T00:00:00Z' }))
  })

  it('merges settings field by field, local winning a clash', () => {
    const local = { ...base, prefs: { units: 'imperial', week: 1 } }
    const remote = { ...base, prefs: { units: 'metric', week: 0 } }
    expect(mergeStores(base, local, remote).prefs).toEqual({ units: 'imperial', week: 0 })
    expect(mergeStores(base, { ...base, prefs: { units: 'a', week: 1 } }, { ...base, prefs: { units: 'b', week: 1 } }).prefs.units).toBe('a')
  })

  it('merges plain lists as sets, removals included', () => {
    const b = { ids: ['a', 'b', 'c'] }
    expect(mergeStores(b, { ids: ['a', 'c', 'd'] }, { ids: ['a', 'b', 'c', 'e'] }).ids).toEqual(['a', 'c', 'd', 'e'])
  })

  it('matches check-ins by date and 1RMs by exercise', () => {
    const b = { wellbeing: [{ date: '2026-11-01', sleepHours: 7 }], maxes: [{ exercise: 'Squat', kg: 100 }] }
    const local = { wellbeing: [{ date: '2026-11-01', sleepHours: 7, hrv: 80 }], maxes: [{ exercise: 'Squat', kg: 100 }] }
    const remote = { wellbeing: [{ date: '2026-11-01', sleepHours: 8 }, { date: '2026-11-02', mood: 4 }], maxes: [{ exercise: 'Squat', kg: 105 }] }
    expect(mergeStores(b, local, remote)).toEqual({
      wellbeing: [{ date: '2026-11-01', sleepHours: 8, hrv: 80 }, { date: '2026-11-02', mood: 4 }],
      maxes: [{ exercise: 'Squat', kg: 105 }],
    })
  })

  it('drops a field one side removed and the other left alone', () => {
    expect(merge({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 2, c: 3 }, 'local')).toEqual({ a: 1, c: 3 })
  })
})

describe('mergeStores without a base (joining an account)', () => {
  it('keeps everything from both, the account winning clashes', () => {
    const local = { sessions: [s('1', { rpe: 4 }), s('mine')], prefs: { units: 'imperial', theme: 'dark' } }
    const remote = { sessions: [s('1', { rpe: 6 }), s('theirs')], prefs: { units: 'metric' } }
    expect(mergeStores(undefined, local, remote)).toEqual({
      sessions: [s('1', { rpe: 6 }), s('mine'), s('theirs')],
      prefs: { units: 'metric', theme: 'dark' },
    })
  })
})

describe('mergeStores with the coach profile', () => {
  const profile = { goal: { eventId: 'r', legs: [{ sport: 'run', distanceM: 5000 }] }, health: {}, injuries: [s('knee')], availability: { daysPerWeek: 5 }, updatedAt: '2026-11-01T10:00:00Z' }
  const base = { blocks: [], profile }

  it('keeps an injury added on each device and answers changed on either', () => {
    const local = { ...base, profile: { ...profile, injuries: [...profile.injuries, s('calf')], availability: { daysPerWeek: 6 } } }
    const remote = { ...base, profile: { ...profile, injuries: [...profile.injuries, s('hip')], health: { heart: false } } }
    const merged = mergeStores(base, local, remote).profile as typeof profile
    expect(merged.injuries.map((i) => i.id)).toEqual(['knee', 'calf', 'hip'])
    expect(merged.availability).toEqual({ daysPerWeek: 6 })
    expect(merged.health).toEqual({ heart: false })
  })
})
