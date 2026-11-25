import { describe, expect, it } from 'vitest'
import { changeOver, weightSeries } from './weight'

const w = (date: string, weightKg?: number) => ({ date, weightKg })

describe('weightSeries', () => {
  it('skips check-ins without a weight and sorts oldest first', () => {
    const s = weightSeries([w('2026-11-03', 80), w('2026-11-01', 81), w('2026-11-02')])
    expect(s.map((p) => p.date)).toEqual(['2026-11-01', '2026-11-03'])
  })

  it('averages the weigh-ins in the 7 days up to each date', () => {
    const s = weightSeries([w('2026-11-01', 82), w('2026-11-03', 80), w('2026-11-08', 78)])
    expect(s[1].avgKg).toBe(81)
    // 1 Nov is 7 days before 8 Nov, so it drops out; 3 Nov is still in.
    expect(s[2].avgKg).toBe(79)
  })
})

describe('changeOver', () => {
  const daily = Array.from({ length: 30 }, (_, i) => w(`2026-10-${String(i + 1).padStart(2, '0')}`, 90 - i * 0.1))

  it('compares the latest average with the average a number of days earlier', () => {
    const s = weightSeries(daily)
    const change = changeOver(s, 14)!
    expect(change).toBeCloseTo(-1.4, 5)
  })

  it('is undefined when the series does not reach back far enough', () => {
    expect(changeOver(weightSeries(daily), 90)).toBeUndefined()
    expect(changeOver([], 7)).toBeUndefined()
  })
})
