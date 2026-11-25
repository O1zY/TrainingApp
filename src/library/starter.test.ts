import { describe, expect, it } from 'vitest'
import { workoutIntensity, isTest } from '../plan/generate'
import { estimateSec } from '../plan/oneOffs'
import { STARTER_WORKOUTS, missingStarters } from './starter'
import { copyWorkout, eventFromBrick, isBrick, structureSummary, workoutFromEvent } from './workouts'

describe('starter workouts', () => {
  it('have unique ids, and unique ids inside each workout', () => {
    const ids = STARTER_WORKOUTS.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const w of STARTER_WORKOUTS) {
      const inner = [...(w.pieces ?? []).map((p) => p.id), ...(w.legs ?? []).flatMap((l) => [l.id, ...(l.pieces ?? []).map((p) => p.id)]), ...(w.exercises ?? []).flatMap((e) => [e.id, ...e.sets.map((s) => s.id)])]
      expect(new Set(inner).size, w.name).toBe(inner.length)
      expect(inner.every(Boolean), w.name).toBe(true)
    }
  })

  it('each says where it comes from and has some structure', () => {
    for (const w of STARTER_WORKOUTS) {
      expect(w.source, w.name).toBeTruthy()
      expect(w.description, w.name).toBeTruthy()
      expect(Boolean(w.pieces?.length || w.exercises?.length || w.durationSec || w.legs?.length), w.name).toBe(true)
      if (!w.legs) expect(estimateSec(w), w.name).toBeGreaterThan(0)
    }
  })

  it('cover swim, bike, run and strength, with a test for each marker', () => {
    const sports = new Set(STARTER_WORKOUTS.map((w) => w.sport))
    for (const s of ['swim', 'bike', 'run', 'strength'] as const) expect(sports.has(s)).toBe(true)
    const tests = STARTER_WORKOUTS.filter(isTest).map((w) => w.sport)
    expect(tests.sort()).toEqual(['bike', 'run', 'swim'])
  })

  it('give the planner easy, steady-hard and key sessions in each endurance sport', () => {
    for (const s of ['swim', 'bike', 'run'] as const) {
      const levels = new Set(STARTER_WORKOUTS.filter((w) => w.sport === s && !w.legs && !isTest(w)).map(workoutIntensity))
      expect(levels.size, s).toBeGreaterThanOrEqual(2)
    }
  })

  it('only offers the ones that are missing', () => {
    expect(missingStarters([])).toHaveLength(STARTER_WORKOUTS.length)
    expect(missingStarters([{ id: STARTER_WORKOUTS[0].id }])).toHaveLength(STARTER_WORKOUTS.length - 1)
  })
})

describe('library cards', () => {
  it('summarise long mixed sets as a count', async () => {
    const { structureSummary } = await import('./workouts')
    const get = (slug: string) => STARTER_WORKOUTS.find((w) => w.id === `starter-${slug}`)!
    expect(structureSummary(get('swim-brownlee-15x100'), 'metric')).toMatch(/^15×100m/)
    expect(structureSummary(get('bike-yee-brick-bike'), 'metric')).toMatch(/^10 pieces/)
    expect(structureSummary(get('swim-10x100-css'), 'metric')).toMatch(/^10×100m/)
  })
})

describe('starter bricks', () => {
  const bricks = STARTER_WORKOUTS.filter(isBrick)

  it('include a brick and a duathlon, each with at least two legs that have something to do', () => {
    expect(bricks.length).toBeGreaterThanOrEqual(3)
    expect(bricks.some((w) => w.brickKind === 'duathlon')).toBe(true)
    for (const w of bricks) {
      expect(w.legs!.length, w.name).toBeGreaterThanOrEqual(2)
      expect(w.sport, w.name).toBe(w.legs![0].sport)
      for (const l of w.legs!) expect(Boolean(l.pieces?.length || l.durationSec || l.distanceM), `${w.name}: ${l.sport}`).toBe(true)
    }
  })

  it('pre-fill a multisport event: one session per leg, targets in, linked to the brick', () => {
    const yee = STARTER_WORKOUTS.find((w) => w.id === 'starter-brick-yee-big-brick')!
    const { event, legs } = eventFromBrick(yee, [], '2026-11-30')
    expect(event).toMatchObject({ kind: 'brick', date: '2026-11-30', title: yee.name, workoutId: yee.id })
    expect(legs.map((l) => l.sport)).toEqual(['bike', 'run'])
    expect(legs.every((l) => l.date === '2026-11-30' && l.workoutId === undefined)).toBe(true)
    expect(legs[1].pieces).toHaveLength(2)
    expect(legs[1].pieces![0].distanceM).toBe(2000)
  })

  it('turn a logged event back into a brick, leaving transitions out', () => {
    const base = { status: 'completed', source: 'manual', createdAt: '', updatedAt: '' } as const
    const run = { ...base, id: 'r', sport: 'run', date: '2026-11-01', distanceM: 5000 } as const
    const t = { ...base, id: 't', sport: 'transition', date: '2026-11-01', durationSec: 40 } as const
    const bike = { ...base, id: 'b', sport: 'bike', date: '2026-11-01', durationSec: 3600, hrZone: 3 } as const
    const w = workoutFromEvent({ id: 'm', kind: 'duathlon', title: 'Local duathlon', date: '2026-11-01', legIds: ['r', 't', 'bike'], createdAt: '', updatedAt: '' }, [run, t, bike])
    expect(w).toMatchObject({ name: 'Local duathlon', brickKind: 'duathlon', sport: 'run' })
    expect(w.legs!.map((l) => l.sport)).toEqual(['run', 'bike'])
    expect(w.legs![0]).toMatchObject({ distanceM: 5000, durationSec: undefined })
    expect(w.legs![1]).toMatchObject({ durationSec: 3600 })
    expect(w.legs![1].hrZone).toBe(3)
  })

  it('read as a chain of legs on a library card, and copy with fresh ids', () => {
    const duo = bricks.find((w) => w.brickKind === 'duathlon')!
    expect(structureSummary(duo, 'metric')).toMatch(/^Run 5km · Z4 → Bike 20km · .*% FTP → Run 2\.5km · Z4$/)
    const copy = copyWorkout(duo)
    expect(copy.legs!.map((l) => l.id)).not.toEqual(duo.legs!.map((l) => l.id))
    expect(copy.legs).toHaveLength(duo.legs!.length)
  })
})
