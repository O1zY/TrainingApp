import { describe, expect, it } from 'vitest'
import { STARTER_WORKOUTS } from '../library/starter'
import { eventFromBrick } from '../library/workouts'
import { brickSets, builtInBrick, estimateBrickSec } from './bricks'
import { planBlock } from './generate'
import { plannedWorkout } from './planned'
import type { Block, PlanEvent, PlanPrefs, PlannedSession } from './types'

const prefs: PlanPrefs = { commuteMin: 20, gapMin: 30, dayStart: '06:00', dayEnd: '21:00', defaultDemand: 'feet', workKeywords: [], calendarIds: [] }
const sport = (s: 'swim' | 'bike' | 'run' | 'strength', sessions: number, key: number) => ({ sport: s, sessions, key, easyMin: 45, long: false })

const block = (over: Partial<Block> = {}): Block => ({
  id: 'b',
  name: 'Block',
  start: '2026-11-30',
  weeks: 8,
  buildWeeks: 3,
  progressionPct: 8,
  deloadPct: 60,
  sports: [sport('run', 3, 1), sport('bike', 3, 1)],
  maxDays: 6,
  doubles: true,
  benchmarks: [],
  libraryMix: 0,
  bricksPerWeek: 1,
  createdAt: '',
  updatedAt: '',
  ...over,
})

const plan = (b: Block, extra: { events?: PlanEvent[]; workouts?: Parameters<typeof planBlock>[0]['workouts']; fixed?: PlannedSession[] } = {}) =>
  planBlock({ block: b, events: extra.events ?? [], commitments: [], prefs, workouts: extra.workouts ?? [], fixed: extra.fixed ?? [], from: b.start })

const week = (p: PlannedSession[], n: number) => {
  const from = new Date(Date.parse('2026-11-30') + n * 7 * 86400000).toISOString().slice(0, 10)
  const to = new Date(Date.parse(from) + 6 * 86400000).toISOString().slice(0, 10)
  return p.filter((s) => s.date >= from && s.date <= to)
}

describe('brick sets', () => {
  it('offers bike–run whenever the block has both, a triathlon with swim too, a duathlon only when a race calls for it', () => {
    const sets = (b: Block, events: PlanEvent[] = []) => brickSets(b, events).map((s) => s.join('-'))
    expect(sets(block())).toEqual(['bike-run'])
    expect(sets(block({ sports: [sport('swim', 2, 1), sport('bike', 3, 1), sport('run', 3, 1)] }))).toEqual(['bike-run', 'swim-bike-run'])
    const dua: PlanEvent = { id: 'r', kind: 'race', name: 'Duathlon', date: '2027-01-10', priority: 'A', multisport: 'duathlon' }
    expect(sets(block(), [dua])).toEqual(['bike-run', 'run-bike-run'])
    expect(sets(block({ sports: [sport('run', 3, 1)] }))).toEqual([])
    expect(sets(block({ sports: [sport('swim', 2, 1), sport('bike', 3, 1)] }))).toEqual(['swim-bike'])
  })
})

describe('built-in bricks', () => {
  it('have legs with something to do, a kind, and a length', () => {
    for (const legs of [['bike', 'run'], ['swim', 'bike'], ['swim', 'bike', 'run'], ['run', 'bike', 'run']] as const) {
      for (const [intensity, short] of [['moderate', false], ['key', false], ['moderate', true]] as const) {
        const b = builtInBrick(legs, intensity, 1, short)
        expect(b.legs!.map((l) => l.sport), `${legs} ${intensity} ${short}`).toEqual([...legs])
        expect(b.legs!.every((l) => l.pieces?.length || l.durationSec || l.distanceM)).toBe(true)
        expect(estimateBrickSec(b.legs!)).toBeGreaterThan(20 * 60)
        expect(b.sport).toBe(legs[0])
      }
    }
    expect(builtInBrick(['run', 'bike', 'run'], 'key', 1).brickKind).toBe('duathlon')
  })
})

describe('planning bricks', () => {
  it('puts one brick in each build week, using one bike and one run session', () => {
    const none = plan(block({ bricksPerWeek: 0 })).planned
    const some = plan(block()).planned
    for (const n of [0, 1, 2]) {
      const w = week(some, n)
      expect(w.filter((p) => p.legSports?.length)).toHaveLength(1)
      expect(w.filter((p) => !p.legSports && p.sport === 'bike')).toHaveLength(week(none, n).filter((p) => p.sport === 'bike').length - 1)
      expect(w.filter((p) => !p.legSports && p.sport === 'run')).toHaveLength(week(none, n).filter((p) => p.sport === 'run').length - 1)
    }
  })

  it('leaves blocks without the setting exactly as they were', () => {
    const { bricksPerWeek: _b, ...rest } = block()
    expect(plan(rest as Block).planned.some((p) => p.legSports)).toBe(false)
  })

  it('keeps bricks out of deload and recovery weeks, and uses a short one in taper', () => {
    const race: PlanEvent = { id: 'r', kind: 'race', name: 'Race', date: '2027-01-17', priority: 'A', multisport: 'duathlon' }
    const planned = plan(block({ weeks: 10 }), { events: [race] }).planned
    const bricks = planned.filter((p) => p.legSports)
    const kinds = Object.fromEntries(planBlock({ block: block({ weeks: 10 }), events: [race], commitments: [], prefs, workouts: [], fixed: [], from: '2026-11-30' }).weeks.map((w) => [w.start, w.kind]))
    for (const b of bricks) {
      const start = Object.keys(kinds).filter((s) => s <= b.date).at(-1)!
      expect(['build', 'taper'], b.date).toContain(kinds[start])
    }
    const taper = bricks.filter((b) => b.title === 'Duathlon sharpener' || b.title === 'Race-pace brick')
    expect(taper.length).toBeGreaterThan(0)
    expect(taper.every((b) => b.intensity === 'moderate')).toBe(true)
  })

  it('never puts two sessions of a brick’s sports on its day, and gives it a real duration', () => {
    const planned = plan(block()).planned
    for (const p of planned.filter((x) => x.legSports)) {
      expect(p.sport).toBe(p.legSports![0])
      expect(p.durationSec).toBeGreaterThan(20 * 60)
      const same = planned.filter((x) => x.date === p.date && x.id !== p.id && p.legSports!.includes(x.sport))
      expect(same).toHaveLength(0)
    }
  })

  it('uses library bricks when the mix asks for them, and plans them as library workouts', () => {
    const lib = STARTER_WORKOUTS.filter((w) => w.legs && w.legs.every((l) => ['bike', 'run'].includes(l.sport)) && w.legs.length === 2)
    expect(lib.length).toBeGreaterThan(0)
    const planned = plan(block({ libraryMix: 100 }), { workouts: lib }).planned.filter((p) => p.legSports)
    expect(planned.length).toBeGreaterThan(0)
    expect(planned.every((p) => p.workoutId && lib.some((w) => w.id === p.workoutId))).toBe(true)
    expect(plannedWorkout(planned[0], lib)!.legs).toHaveLength(2)
  })

  it('skips, and says so, when the week has no session left in one of the brick’s sports', () => {
    const r = plan(block({ sports: [sport('run', 1, 0), sport('bike', 3, 1)], bricksPerWeek: 2 }))
    expect(week(r.planned, 0).filter((p) => p.legSports).length).toBeLessThanOrEqual(1)
    expect(r.notes.some((n) => /no room for a bike–run brick/.test(n))).toBe(true)
  })

  it('counts a brick already in the week, so re-planning does not add another', () => {
    const first = plan(block()).planned
    const fixed = week(first, 0).filter((p) => p.legSports).map((p) => ({ ...p, locked: true }))
    const again = plan(block(), { fixed }).planned
    expect(week(again, 0).filter((p) => p.legSports)).toHaveLength(0)
  })

  it('pre-fills the multisport log from a planned brick', () => {
    const p = plan(block()).planned.find((x) => x.legSports)!
    const w = plannedWorkout(p, [])!
    const { legs } = eventFromBrick({ ...w, id: p.id, createdAt: '', updatedAt: '' }, [], p.date)
    expect(legs.map((l) => l.sport)).toEqual(p.legSports)
  })
})
