import { describe, expect, it } from 'vitest'
import type { SessionDraft } from '../log/LogStore'
import type { Session } from '../log/types'
import type { StravaActivity, StravaLap } from './api'
import { lapsToPieces, stravaSport, toSession, usefulTitle } from './convert'
import { matchScore, planImport, plannedFor } from './match'
import { findMultisport } from './multisport'

const act = (p: Partial<StravaActivity>): StravaActivity => ({
  id: 1,
  name: 'Morning Run',
  sport_type: 'Run',
  start_date_local: '2026-11-03T07:00:00Z',
  elapsed_time: 3600,
  moving_time: 3500,
  distance: 10000,
  ...p,
})

let n = 0
const manual = (p: Partial<Session>): Session => ({
  id: `m${++n}`,
  sport: 'run',
  date: '2026-11-03',
  startTime: '07:05',
  durationSec: 3500,
  distanceM: 10000,
  status: 'completed',
  source: 'manual',
  createdAt: '',
  updatedAt: '',
  ...p,
})
const draft = (p: Partial<StravaActivity> = {}): SessionDraft => toSession(act(p))

describe('stravaSport', () => {
  it('tells the erg from the water by GPS', () => {
    expect(stravaSport(act({ sport_type: 'Rowing' })).sport).toBe('erg')
    expect(stravaSport(act({ sport_type: 'Rowing', start_latlng: [51.5, -0.9] })).sport).toBe('row')
    expect(stravaSport(act({ sport_type: 'Rowing', start_latlng: [51.5, -0.9], trainer: true })).sport).toBe('erg')
  })
  it('maps the other families', () => {
    expect(stravaSport(act({ sport_type: 'VirtualRide' }))).toEqual({ sport: 'bike', indoor: true })
    expect(stravaSport(act({ sport_type: 'Crossfit' }))).toEqual({ sport: 'strength', type: 'wod' })
    expect(stravaSport(act({ sport_type: 'Swim' }))).toEqual({ sport: 'swim', type: 'pool' })
    expect(stravaSport(act({ sport_type: 'Kitesurf' }))).toEqual({ sport: 'other' })
  })
})

describe('toSession', () => {
  it('drops automatic names, doubles run cadence and uses clock time for races', () => {
    expect(usefulTitle('Morning Run')).toBeUndefined()
    expect(usefulTitle('Regents Park 10k')).toBe('Regents Park 10k')
    const d = draft({ average_cadence: 85, workout_type: 1 })
    expect(d.rate).toBe(170)
    expect(d.durationSec).toBe(3600)
    expect(d.type).toBe('race')
    expect(draft().durationSec).toBe(3500)
    expect(draft().externalId).toBe('1')
  })
})

describe('lapsToPieces', () => {
  const lap = (distance: number, elapsed_time: number, i = 0): StravaLap => ({ lap_index: i, distance, elapsed_time, moving_time: elapsed_time, average_speed: distance / elapsed_time })

  it('turns work laps into pieces and folds slow laps into rest', () => {
    const laps = [lap(1500, 600), lap(1000, 200), lap(100, 120), lap(1000, 202), lap(100, 120), lap(1000, 199), lap(800, 400)]
    const pieces = lapsToPieces(laps, 'run')!
    expect(pieces.map((p) => p.distanceM)).toEqual([1000, 1000, 1000])
    expect(pieces.map((p) => p.restSec)).toEqual([120, 120, undefined])
  })

  it('ignores automatic 1 km splits', () => {
    expect(lapsToPieces([lap(1000, 300), lap(1000, 290), lap(1000, 310), lap(420, 120)], 'run')).toBeUndefined()
  })
})

describe('matchScore / planImport', () => {
  it('merges a clear match with a hand-logged session', () => {
    const m = manual({})
    expect(matchScore(draft(), m)).toBe(1 + 2 + 2 + 2)
    expect(planImport([draft()], [m])).toMatchObject({ merge: [{ sessionId: m.id }], create: [], review: [] })
  })

  it('treats erg and on-water as the same sport', () => {
    expect(matchScore(draft({ sport_type: 'Rowing' }), manual({ sport: 'row' }))).toBeDefined()
  })

  it('rules out sessions that clearly differ', () => {
    expect(matchScore(draft(), manual({ startTime: '18:00' }))).toBeUndefined()
    expect(matchScore(draft(), manual({ distanceM: 5000 }))).toBeUndefined()
    expect(matchScore(draft(), manual({ sport: 'bike' }))).toBeUndefined()
    expect(matchScore(draft(), manual({ date: '2026-11-04' }))).toBeUndefined()
  })

  it('asks when two hand-logged sessions fit equally well', () => {
    const plan = planImport([draft()], [manual({}), manual({})])
    expect(plan.merge).toHaveLength(0)
    expect(plan.review[0].candidateIds).toHaveLength(2)
  })

  it('imports as new when nothing fits', () => {
    expect(planImport([draft()], [manual({ sport: 'bike' })]).create).toHaveLength(1)
  })

  it('links to the only open planned session that day', () => {
    const p = { id: 'p', date: '2026-11-03', sport: 'run' } as Parameters<typeof plannedFor>[1][number]
    expect(plannedFor(draft(), [p], new Set())).toBe(p)
    expect(plannedFor(draft(), [p], new Set(['p']))).toBeUndefined()
    expect(plannedFor(draft(), [p, { ...p, id: 'q' }], new Set())).toBeUndefined()
  })
})

describe('findMultisport', () => {
  const leg = (id: number, sport_type: string, start: string, elapsed_time: number) => act({ id, sport_type, start_date_local: `2026-10-04T${start}Z`, elapsed_time })

  it('chains run → bike → run into a duathlon, ignoring a warm-up jog', () => {
    const list = [
      leg(1, 'Run', '08:30:00', 600), // warm-up, ends 08:40, next starts 08:50
      leg(2, 'Run', '08:50:00', 1200), // ends 09:10
      leg(3, 'Ride', '09:11:30', 2400), // ends 09:51:30
      leg(4, 'Run', '09:52:30', 700),
    ]
    expect(findMultisport(list)).toEqual([{ kind: 'duathlon', legs: [1, 2, 3] }])
  })

  it("doesn't group legs with long gaps or a brick", () => {
    expect(findMultisport([leg(1, 'Run', '08:00:00', 600), leg(2, 'Ride', '09:00:00', 600), leg(3, 'Run', '09:11:00', 600)])).toEqual([])
    expect(findMultisport([leg(1, 'Ride', '08:00:00', 3600), leg(2, 'Run', '09:01:00', 1200)])).toEqual([])
  })
})
