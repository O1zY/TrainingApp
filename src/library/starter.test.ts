import { describe, expect, it } from 'vitest'
import { workoutIntensity, isTest } from '../plan/generate'
import { estimateSec } from '../plan/oneOffs'
import { STARTER_WORKOUTS, missingStarters } from './starter'

describe('starter workouts', () => {
  it('have unique ids, and unique ids inside each workout', () => {
    const ids = STARTER_WORKOUTS.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const w of STARTER_WORKOUTS) {
      const inner = [...(w.pieces ?? []).map((p) => p.id), ...(w.exercises ?? []).flatMap((e) => [e.id, ...e.sets.map((s) => s.id)])]
      expect(new Set(inner).size, w.name).toBe(inner.length)
      expect(inner.every(Boolean), w.name).toBe(true)
    }
  })

  it('each says where it comes from and has some structure', () => {
    for (const w of STARTER_WORKOUTS) {
      expect(w.source, w.name).toBeTruthy()
      expect(w.description, w.name).toBeTruthy()
      expect(Boolean(w.pieces?.length || w.exercises?.length || w.durationSec), w.name).toBe(true)
      expect(estimateSec(w), w.name).toBeGreaterThan(0)
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
      const levels = new Set(STARTER_WORKOUTS.filter((w) => w.sport === s && !isTest(w)).map(workoutIntensity))
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
