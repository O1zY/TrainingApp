import { describe, expect, it } from 'vitest'
import type { Session } from '../log/types'
import { counted, dailyLoad, loadSeries, missingRpe, ratioBand } from './load'

let n = 0
const s = (p: Partial<Session>): Session => ({
  id: String(++n),
  sport: 'run',
  date: '2026-10-01',
  status: 'completed',
  source: 'manual',
  createdAt: '',
  updatedAt: '',
  ...p,
})

describe('dailyLoad', () => {
  it('adds RPE × minutes per day, leaving out planned sessions and transitions', () => {
    const byDay = dailyLoad([
      s({ rpe: 5, durationSec: 3600 }),
      s({ rpe: 8, durationSec: 1800 }),
      s({ rpe: 9, durationSec: 600, sport: 'transition' }),
      s({ rpe: 9, durationSec: 600, status: 'planned' as Session['status'] }),
      s({ durationSec: 600 }),
    ])
    expect(byDay.get('2026-10-01')).toBe(300 + 240)
  })
})

describe('loadSeries', () => {
  it('runs every day to the end date, with fatigue reacting faster than fitness', () => {
    const series = loadSeries([s({ date: '2026-10-01', rpe: 6, durationSec: 6000 })], '2026-10-15')
    expect(series).toHaveLength(15)
    expect(series[0].load).toBe(600)
    expect(series[0].fatigue).toBeGreaterThan(series[0].fitness)
    expect(series.at(-1)!.load).toBe(0)
    // Fatigue decays faster too.
    expect(series.at(-1)!.fatigue / series[0].fatigue).toBeLessThan(series.at(-1)!.fitness / series[0].fitness)
  })

  it('settles at the daily load when training is steady', () => {
    const days = Array.from({ length: 400 }, (_, i) => {
      const d = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)
      return s({ date: d, rpe: 5, durationSec: 3600 })
    })
    const last = loadSeries(days, days.at(-1)!.date).at(-1)!
    expect(last.fitness).toBeCloseTo(300, 0)
    expect(last.fatigue).toBeCloseTo(300, 0)
  })

  it('is empty with nothing logged', () => expect(loadSeries([], '2026-10-01')).toEqual([]))
})

describe('ratioBand', () => {
  it.each([
    [0.7, 'low'],
    [0.8, 'good'],
    [1.3, 'good'],
    [1.4, 'caution'],
    [1.6, 'high'],
  ])('%s → %s', (r, band) => expect(ratioBand(r)).toBe(band))
})

describe('missingRpe', () => {
  it('counts completed sessions in range with time but no RPE', () => {
    const list = [s({ durationSec: 600 }), s({ durationSec: 600, rpe: 4 }), s({ date: '2026-12-01', durationSec: 600 })]
    expect(missingRpe(list, '2026-10-01', '2026-10-31')).toBe(1)
    expect(list.filter(counted)).toHaveLength(3)
  })
})
