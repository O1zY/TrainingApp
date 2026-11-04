import { describe, expect, it } from 'vitest'
import { diff, fingerprint, toEvent, toWrite, type Existing } from './calendarOut'
import type { PlannedSession } from './types'

const p = (x: Partial<PlannedSession>): PlannedSession => ({ id: 'p1', date: '2026-11-10', sport: 'erg', intensity: 'easy', title: 'Steady 60′', ...x })
const opts = { timeZone: 'Europe/London', appUrl: 'https://tt.example' }

describe('toEvent', () => {
  it('writes a timed session with its length, colour for key work and a link back', () => {
    const e = toEvent({ planned: p({ time: '06:30', durationSec: 75 * 60, intensity: 'key', title: '8 × 500m', reason: 'Day off work' }), sportLabel: 'Erg', details: '8 × 500m, 2′ rest', done: false }, opts)
    expect(e.summary).toBe('8 × 500m')
    expect(e.start).toEqual({ dateTime: '2026-11-10T06:30:00', timeZone: 'Europe/London' })
    expect(e.end).toEqual({ dateTime: '2026-11-10T07:45:00', timeZone: 'Europe/London' })
    expect(e.colorId).toBe('3')
    expect(e.transparency).toBe('opaque')
    expect(e.description.split('\n')).toEqual(['Key session · Erg · 75′', '8 × 500m, 2′ rest', 'Why this day: Day off work', 'Open in Training Tracker: https://tt.example/plan/session/p1'])
    expect(e.extendedProperties.private.ttPlanId).toBe('p1')
  })

  it('rolls past midnight and makes untimed sessions all-day and free', () => {
    expect(toEvent({ planned: p({ time: '23:30', durationSec: 3600 }), sportLabel: 'Erg', done: false }, opts).end).toEqual({ dateTime: '2026-11-11T00:30:00', timeZone: 'Europe/London' })
    const allDay = toEvent({ planned: p({}), sportLabel: 'Erg', done: false }, opts)
    expect(allDay.start).toEqual({ date: '2026-11-10' })
    expect(allDay.end).toEqual({ date: '2026-11-11' })
    expect(allDay.transparency).toBe('transparent')
    expect(allDay.colorId).toBeUndefined()
  })

  it('ticks done sessions and changes the fingerprint when anything shown changes', () => {
    const a = toEvent({ planned: p({}), sportLabel: 'Erg', done: false }, opts)
    const b = toEvent({ planned: p({}), sportLabel: 'Erg', done: true }, opts)
    expect(b.summary).toBe('✓ Steady 60′')
    expect(a.extendedProperties.private.ttHash).not.toBe(b.extendedProperties.private.ttHash)
    expect(toEvent({ planned: p({}), sportLabel: 'Erg', done: false }, opts).extendedProperties.private.ttHash).toBe(a.extendedProperties.private.ttHash)
  })
})

describe('toWrite', () => {
  it('keeps today onwards, not skipped', () => {
    const list = [p({ id: 'a', date: '2026-11-03' }), p({ id: 'b', date: '2026-11-04' }), p({ id: 'c', date: '2026-11-05', skipped: true })]
    expect(toWrite(list, '2026-11-04').map((x) => x.id)).toEqual(['b'])
  })
})

describe('diff', () => {
  const today = '2026-11-04'
  const ev = (id: string, x: Partial<PlannedSession> = {}) => toEvent({ planned: p({ id, date: '2026-11-05', ...x }), sportLabel: 'Run', done: false }, opts)
  const have = (eventId: string, planId: string | undefined, hash: string | undefined, date = '2026-11-05'): Existing => ({ eventId, planId, hash, date })

  it('inserts new, updates changed, leaves unchanged and removes what is no longer planned', () => {
    const same = ev('same')
    const moved = ev('moved', { date: '2026-11-06' })
    const fresh = ev('fresh')
    const out = diff(
      [same, moved, fresh],
      [
        have('e1', 'same', same.extendedProperties.private.ttHash),
        have('e2', 'moved', 'old'),
        have('e3', 'gone', 'x'),
        have('e4', 'old-past', 'x', '2026-11-01'),
        have('e5', 'same', same.extendedProperties.private.ttHash),
        have('e6', undefined, undefined),
      ],
      today,
    )
    expect(out.insert).toEqual([fresh])
    expect(out.update).toEqual([{ eventId: 'e2', body: moved }])
    expect(out.unchanged).toBe(1)
    // Duplicate (e5), stray without an id (e6) and dropped session (e3); the past one (e4) stays.
    expect(out.remove.sort()).toEqual(['e3', 'e5', 'e6'])
  })

  it('fingerprints are short and stable', () => {
    expect(fingerprint('abc')).toBe(fingerprint('abc'))
    expect(fingerprint('abc')).not.toBe(fingerprint('abd'))
  })
})
