import { describe as group, expect, it } from 'vitest'
import type { Wellbeing } from '../log/types'
import { addDays } from '../plan/dates'
import type { LoadDay } from './load'
import { METRICS, bandCuts, bandOf, byBand, describe, links, pairUp, ranks, spearman, strength } from './wellbeing'

const day = (date: string, load: number, fatigue = load): LoadDay => ({ date, load, fatigue, fitness: 0 })
const check = (date: string, p: Partial<Wellbeing> = {}): Wellbeing => ({ date, updatedAt: '', ...p })
const metric = (key: string) => METRICS.find((m) => m.key === key)!

group('ranks and spearman', () => {
  it('shares ranks between ties', () => {
    expect(ranks([10, 20, 20, 5])).toEqual([2, 3.5, 3.5, 1])
  })

  it('is 1 for any rising relationship and -1 for falling, not just straight lines', () => {
    expect(spearman([1, 2, 3, 4], [1, 4, 9, 100])).toBeCloseTo(1)
    expect(spearman([1, 2, 3, 4], [5, 3, 2, 1])).toBeCloseTo(-1)
  })

  it('is undefined when one side never changes', () => {
    expect(spearman([1, 2, 3], [3, 3, 3])).toBeUndefined()
  })

  it('bands strength by size, either sign', () => {
    expect(strength(0.1)).toBe('none')
    expect(strength(-0.3)).toBe('weak')
    expect(strength(0.5)).toBe('moderate')
    expect(strength(-0.8)).toBe('strong')
  })
})

group('pairUp', () => {
  it('pairs each check-in with the day before, skipping days before any load and outside the range', () => {
    const series = [day('2026-10-02', 300, 40), day('2026-10-03', 0, 35), day('2026-10-04', 500, 90)]
    const pairs = pairUp(
      [check('2026-10-01'), check('2026-10-02'), check('2026-10-03'), check('2026-10-04'), check('2026-10-05'), check('2026-10-06')],
      series,
      '2026-10-01',
      '2026-10-05',
    )
    expect(pairs.map((p) => [p.date, p.yesterday, p.week])).toEqual([
      ['2026-10-03', 300, 40],
      ['2026-10-04', 0, 35],
      ['2026-10-05', 500, 90],
    ])
  })
})

group('links', () => {
  // 14 days where soreness tracks the day before's load and sleep doesn't vary with it.
  const start = '2026-10-01'
  const loads = [0, 200, 400, 600, 100, 0, 500, 300, 700, 0, 250, 450, 650, 150]
  const series = loads.map((l, i) => day(addDays(start, i), l))
  const checks = loads.map((l, i) => check(addDays(start, i + 1), { soreness: Math.min(5, 1 + Math.round(l / 175)), sleepHours: 8 }))
  const pairs = pairUp(checks, series, start, addDays(start, 30))

  it('finds a strong link between soreness and the day before, and flags it as bad', () => {
    const found = links(pairs)
    const sore = found.find((l) => l.metric.key === 'soreness' && l.driver === 'yesterday')!
    expect(sore.r).toBeGreaterThan(0.9)
    expect(sore.strength).toBe('strong')
    expect(sore.goodWithLoad).toBe(false)
    expect(describe(sore)).toBe('Soreness is clearly higher the morning after a bigger day')
  })

  it('leaves out metrics that never change and metrics with too few check-ins', () => {
    expect(links(pairs).some((l) => l.metric.key === 'sleepHours')).toBe(false)
    expect(links(pairs.slice(0, 5))).toEqual([])
  })
})

group('bands', () => {
  it('splits non-zero loads into thirds and treats zero as rest', () => {
    const cuts = bandCuts([0, 100, 200, 300, 400, 500, 600, 0])!
    expect(cuts[0]).toBeCloseTo(266.67, 1)
    expect(cuts[1]).toBeCloseTo(433.33, 1)
    expect(bandOf(0, cuts)).toBe('rest')
    expect(bandOf(100, cuts)).toBe('light')
    expect(bandOf(400, cuts)).toBe('moderate')
    expect(bandOf(600, cuts)).toBe('hard')
    expect(bandCuts([0, 100])).toBeUndefined()
  })

  it('averages a metric by the kind of day before', () => {
    const series = [day('2026-10-01', 0), day('2026-10-02', 600), day('2026-10-03', 600), day('2026-10-04', 100)]
    const pairs = pairUp(
      [check('2026-10-02', { soreness: 1 }), check('2026-10-03', { soreness: 4 }), check('2026-10-04', { soreness: 5 }), check('2026-10-05', {})],
      series,
      '2026-10-01',
      '2026-10-31',
    )
    const rows = byBand(pairs, metric('soreness'), [200, 400])
    expect(rows).toEqual([
      { band: 'rest', n: 1, mean: 1 },
      { band: 'light', n: 0, mean: undefined },
      { band: 'moderate', n: 0, mean: undefined },
      { band: 'hard', n: 2, mean: 4.5 },
    ])
  })
})
