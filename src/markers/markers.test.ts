import { describe, expect, it } from 'vitest'
import { sessionFromWorkout } from '../library/workouts'
import { describeAim, describeTarget } from '../log/targets'
import type { Marker, Session, Workout } from '../log/types'
import { DEFAULT_PREFS } from '../plan/data'
import { planBlock } from '../plan/generate'
import type { Block } from '../plan/types'
import { suggestFromLog, suggestFromSession, thresholdFromRace } from './estimate'
import { currentMarkers, describeChange, formatMarker, isDue, isStale, parseMarker } from './markers'
import { relTarget, resolveAim, zoneTarget, type ZoneContext } from './zones'

const marker = (kind: Marker['kind'], value: number, date = '2026-11-01', extra: Partial<Marker> = {}): Marker => ({
  id: `${kind}-${date}-${value}`,
  kind,
  value,
  date,
  source: 'test',
  createdAt: `${date}T08:00:00Z`,
  updatedAt: `${date}T08:00:00Z`,
  ...extra,
})

const session = (s: Partial<Session>): Session => ({
  id: 's1',
  sport: 'run',
  date: '2026-11-10',
  status: 'completed',
  source: 'manual',
  createdAt: '',
  updatedAt: '',
  ...s,
})

const ctx = (markers: Marker[], today = '2026-11-20'): ZoneContext => ({ markers: currentMarkers(markers), today })

describe('markers', () => {
  it('takes the latest value as current and keeps the rest as history', () => {
    const cur = currentMarkers([marker('ftp', 250, '2026-10-01'), marker('ftp', 262, '2026-11-01'), marker('css', 95, '2026-09-01')])
    expect(cur.ftp?.value).toBe(262)
    expect(cur.css?.value).toBe(95)
  })

  it('goes stale after 8 weeks and is due a re-test after the set interval', () => {
    const m = marker('ftp', 250, '2026-10-01')
    expect(isStale(m, '2026-11-20')).toBe(false)
    expect(isStale(m, '2026-11-27')).toBe(true)
    expect(isDue(m, '2026-11-12', 6)).toBe(true)
    expect(isDue(m, '2026-11-11', 6)).toBe(false)
    expect(isDue(marker('maxHr', 195, '2026-01-01'), '2026-11-20', 6)).toBe(false)
  })

  it('reads and shows values in the athlete’s units', () => {
    expect(parseMarker('runThreshold', '4:10', 'metric')).toBe(250)
    expect(formatMarker('runThreshold', 250, 'metric')).toBe('4:10/km')
    expect(parseMarker('css', '1:45', 'metric')).toBe(1050)
    expect(formatMarker('css', 1050, 'metric')).toBe('1:45/100m')
    expect(parseMarker('erg2k', '6:30', 'metric')).toBe(390)
    expect(parseMarker('ftp', '262', 'metric')).toBe(262)
    expect(parseMarker('ftp', 'abc', 'metric')).toBeUndefined()
  })

  it('says whether a change is an improvement', () => {
    expect(describeChange('erg2k', 395, 390, 'metric')).toEqual({ text: 'faster by 5.0s', better: true })
    expect(describeChange('ftp', 250, 262, 'metric')).toEqual({ text: '+12 W', better: true })
    expect(describeChange('runThreshold', 250, 255, 'metric').better).toBe(false)
  })
})

describe('zones', () => {
  it('turns bike zones into watts from FTP (Coggan levels)', () => {
    expect(zoneTarget('bike', 2, 250)).toEqual({ metric: 'power', min: 140, max: 188 })
    expect(zoneTarget('bike', 4, 250)).toEqual({ metric: 'power', min: 228, max: 263 })
    expect(zoneTarget('bike', 5, 250)).toEqual({ metric: 'power', min: 265, max: undefined })
  })

  it('turns run zones into paces from threshold pace (Friel, % of time)', () => {
    // Threshold 4:00/km = 240 s/km.
    expect(zoneTarget('run', 4, 240)).toEqual({ metric: 'pace', min: 238, max: 252 })
    expect(zoneTarget('run', 1, 240)).toEqual({ metric: 'pace', min: 310, max: undefined })
    expect(zoneTarget('run', 5, 240)).toEqual({ metric: 'pace', min: undefined, max: 238 })
  })

  it('turns erg zones into splits from the 2k (seconds added per 500m)', () => {
    // 6:40 2k = 1:40/500m = 200 s/km. UT2 is +20 to +30s per 500m.
    const ut2 = zoneTarget('erg', 2, 400)!
    expect([ut2.min! / 2, ut2.max! / 2]).toEqual([120, 130])
  })

  it('turns swim zones into paces from CSS (% of speed)', () => {
    // CSS 1:40/100m = 1000 s/km; zone 4 is 99–104% of CSS speed, to the whole second per 100m.
    const z4 = zoneTarget('swim', 4, 1000)!
    expect([z4.min, z4.max]).toEqual([960, 1010])
  })

  it('honours hand-edited bands', () => {
    expect(zoneTarget('bike', 2, 200, { bike: [[null, 50], [60, 70], [71, 89], [90, 104], [105, null]] })).toEqual({ metric: 'power', min: 120, max: 140 })
  })

  it('works out relative targets', () => {
    expect(relTarget('bike', { lo: 95, hi: 105 }, 260)).toEqual({ metric: 'power', min: 247, max: 273 })
    // 2k split +4s: 6:40 2k → 1:40 split → 1:44/500m → 208 s/km, "or faster".
    expect(relTarget('erg', { lo: 4 }, 400)).toEqual({ metric: 'pace', max: 208 })
    // Threshold −5 to +5 s/km.
    expect(relTarget('run', { lo: 5, hi: -5 }, 240)).toEqual({ metric: 'pace', min: 235, max: 245 })
    // CSS +3s/100m = +30 s/km.
    expect(relTarget('swim', { lo: 3 }, 1000)).toEqual({ metric: 'pace', max: 1030 })
  })

  it('resolves an aim: fixed target first, then relative, then zone; nothing without a marker', () => {
    const c = ctx([marker('ftp', 250)])
    expect(resolveAim({ target: { metric: 'hr', max: 150 }, hrZone: 2 }, 'bike', c)?.derived).toBe(false)
    expect(resolveAim({ rel: { lo: 100 }, hrZone: 2 }, 'bike', c)?.target).toEqual({ metric: 'power', min: 250, max: undefined })
    expect(resolveAim({ hrZone: 2 }, 'bike', c)?.target.min).toBe(140)
    expect(resolveAim({ hrZone: 2 }, 'run', c)).toBeUndefined()
    expect(resolveAim({ hrZone: 2 }, 'bike', ctx([marker('ftp', 250, '2026-08-01')]))?.stale).toBe(true)
  })

  it('describes a zone with the numbers it means, and reads one-sided paces the right way', () => {
    const c = ctx([marker('runThreshold', 240)])
    expect(describeAim({ hrZone: 4 }, 'run', 'metric', c)).toBe('3:58–4:12/km · Z4')
    expect(describeAim({ hrZone: 4 }, 'run', 'metric')).toBe('Z4')
    expect(describeTarget({ metric: 'pace', min: 300 }, 'run', 'metric')).toBe('5:00/km or slower')
    expect(describeTarget({ metric: 'pace', max: 240 }, 'run', 'metric')).toBe('4:00/km or faster')
  })

  it('writes the numbers into a session logged from a workout, so it is judged on what was asked then', () => {
    const w: Workout = {
      id: 'w',
      name: '3 × 10′',
      sport: 'bike',
      tags: [],
      createdAt: '',
      updatedAt: '',
      pieces: [{ id: 'p', durationSec: 600, hrZone: 4 }, { id: 'q', durationSec: 600, rel: { lo: 100, hi: 105 } }],
    }
    const s = sessionFromWorkout(w, [], '2026-11-20', ctx([marker('ftp', 250)]))
    expect(s.pieces![0].target).toEqual({ metric: 'power', min: 228, max: 263 })
    expect(s.pieces![0].hrZone).toBe(4)
    expect(s.pieces![1].target).toEqual({ metric: 'power', min: 250, max: 263 })
    expect(s.pieces![1].rel).toBeUndefined()
  })
})

describe('estimates from the log', () => {
  it('matches Daniels’ VDOT: a 46:00 10k gives about 4:40/km threshold', () => {
    expect(thresholdFromRace(10000, 46 * 60)).toBeCloseTo(280.4, 0)
  })

  it('reads a 30′ run test as threshold pace, and a race through VDOT', () => {
    const test = suggestFromSession(session({ type: 'test', distanceM: 7200, durationSec: 1800 }))
    expect(test[0]).toMatchObject({ kind: 'runThreshold', value: 250, source: 'test' })
    const race = suggestFromSession(session({ type: 'race', distanceM: 10000, durationSec: 2760 }))
    expect(race[0]).toMatchObject({ kind: 'runThreshold', source: 'race' })
    expect(suggestFromSession(session({ type: 'easy', distanceM: 10000, durationSec: 3000 }))).toEqual([])
  })

  it('takes 95% of a 20′ bike test, from a rep or the whole session', () => {
    const rep = suggestFromSession(session({ sport: 'bike', type: 'test', pieces: [{ id: 'p', durationSec: 1200, watts: 280 }] }))
    expect(rep[0]).toMatchObject({ kind: 'ftp', value: 266 })
    const whole = suggestFromSession(session({ sport: 'bike', type: 'test', durationSec: 1200, watts: 300 }))
    expect(whole[0].value).toBe(285)
  })

  it('reads a 2k and a 400 + 200 swim test', () => {
    expect(suggestFromSession(session({ sport: 'erg', type: 'test', pieces: [{ id: 'p', distanceM: 2000, durationSec: 395 }] }))[0]).toMatchObject({ kind: 'erg2k', value: 395 })
    const swim = suggestFromSession(
      session({
        sport: 'swim',
        type: 'test',
        pieces: [
          { id: 'a', distanceM: 400, durationSec: 360 },
          { id: 'b', distanceM: 200, durationSec: 165 },
        ],
      }),
    )
    // (360 − 165) / 2 = 97.5 s/100m = 975 s/km.
    expect(swim[0]).toMatchObject({ kind: 'css', value: 975 })
  })

  it('only suggests what is newer than the current marker and not already saved', () => {
    const sessions = [
      session({ id: 'old', type: 'test', distanceM: 7000, durationSec: 1800, date: '2026-10-01' }),
      session({ id: 'new', type: 'test', distanceM: 7300, durationSec: 1800, date: '2026-11-15' }),
    ]
    const cur = [marker('runThreshold', 260, '2026-10-20')]
    expect(suggestFromLog(sessions, cur, '2026-11-20').map((s) => s.sessionId)).toEqual(['new'])
    expect(suggestFromLog(sessions, [...cur, marker('runThreshold', 247, '2026-11-15', { sessionId: 'new' })], '2026-11-20')).toEqual([])
  })

  it('suggests a higher max HR when the log has seen one', () => {
    const s = [session({ id: 'h', hrMax: 199, date: '2026-11-12' })]
    expect(suggestFromLog(s, [], '2026-11-20', 195)[0]).toMatchObject({ kind: 'maxHr', value: 199 })
    expect(suggestFromLog(s, [], '2026-11-20', 200)).toEqual([])
  })
})

describe('deload tests in the planner', () => {
  const block: Block = {
    id: 'b',
    name: 'Block',
    start: '2026-11-02',
    weeks: 8,
    buildWeeks: 3,
    progressionPct: 8,
    deloadPct: 60,
    sports: [
      { sport: 'run', sessions: 3, key: 1, easyMin: 40, long: false },
      { sport: 'bike', sessions: 3, key: 2, easyMin: 60, long: false },
    ],
    maxDays: 6,
    doubles: false,
    benchmarks: [],
    libraryMix: 0,
    createdAt: '',
    updatedAt: '',
  }
  const plan = (b: Block) => planBlock({ block: b, events: [], commitments: [], prefs: DEFAULT_PREFS, workouts: [], fixed: [], from: b.start }).planned

  it('uses a built-in test when the library has none, late in the week', () => {
    const tests = plan(block).filter((p) => p.oneOff?.type === 'test')
    // Deloads in weeks 4 and 8; the main sport (most key sessions) is the bike.
    expect(tests.map((t) => [t.date, t.title])).toEqual([
      ['2026-11-29', '20′ FTP test'],
      ['2026-12-27', '20′ FTP test'],
    ])
  })

  it('takes the test sports in turn', () => {
    const tests = plan({ ...block, testSports: ['run', 'bike'] }).filter((p) => p.oneOff?.type === 'test')
    expect(tests.map((t) => t.title)).toEqual(['30′ run test', '20′ FTP test'])
  })

  it('puts no all-out test in a block without hard sessions', () => {
    const easy = { ...block, sports: block.sports.map((s) => ({ ...s, key: 0 })) }
    expect(plan(easy).some((p) => p.oneOff?.type === 'test')).toBe(false)
  })
})
