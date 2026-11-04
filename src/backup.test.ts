import { beforeEach, describe, expect, it } from 'vitest'
import { BACKUP_DUE_DAYS, backupDue, makeBackup, parseBackup, restoreBackup, summarise } from './backup'
import { KEYS } from './storage'
import { installMemoryStorage } from './test/memoryStorage'

let ls: ReturnType<typeof installMemoryStorage>
beforeEach(() => {
  ls = installMemoryStorage()
  ls.setItem(KEYS.settings, JSON.stringify({ units: 'metric' }))
  ls.setItem(
    KEYS.log,
    JSON.stringify({ sessions: [{ id: 'a', date: '2026-10-02' }, { id: 'b', date: '2026-09-01' }], wellbeing: [{ date: '2026-10-02' }], workouts: [] }),
  )
  ls.setItem(KEYS.plan, JSON.stringify({ blocks: [{ id: 'blk' }], planned: [{ id: 'p1' }, { id: 'p2' }] }))
  ls.setItem(KEYS.strava, JSON.stringify({ tokens: { accessToken: 'secret' }, handled: ['1', '2'] }))
})

describe('makeBackup', () => {
  it('includes every store but never the Strava tokens', () => {
    const b = makeBackup(new Date('2026-11-04T10:00:00Z'))
    expect(Object.keys(b.data).sort()).toEqual(Object.values(KEYS).sort())
    expect(b.data[KEYS.strava]).toEqual({ handled: ['1', '2'] })
    expect(JSON.stringify(b)).not.toContain('secret')
  })

  it('summarises what is in it', () => {
    const s = summarise(makeBackup())
    expect(s).toMatchObject({ sessions: 2, checkIns: 1, workouts: 0, blocks: 1, planned: 2, firstDate: '2026-09-01', lastDate: '2026-10-02' })
  })
})

describe('parseBackup', () => {
  it('round-trips a backup', () => {
    const b = makeBackup()
    expect(parseBackup(JSON.stringify(b)).data).toEqual(b.data)
  })

  it.each([
    ['not json', /valid JSON/],
    ['{"hello": 1}', /isn't a Training Tracker backup/],
    ['{"app":"training-tracker","version":99,"data":{"tt-log-v1":{}}}', /newer version/],
    ['{"app":"training-tracker","version":1,"data":{"tt-log-v1":[1]}}', /damaged/],
    ['{"app":"training-tracker","version":1,"data":{}}', /empty/],
  ])('rejects %s', (text, message) => {
    expect(() => parseBackup(text)).toThrow(message)
  })
})

describe('restoreBackup', () => {
  it('replaces the data, clears stores missing from the backup and keeps the Strava connection', () => {
    const b = parseBackup(JSON.stringify({ app: 'training-tracker', version: 1, data: { [KEYS.log]: { sessions: [] }, [KEYS.strava]: { handled: ['9'] } } }))
    restoreBackup(b)
    expect(JSON.parse(ls.getItem(KEYS.log)!)).toEqual({ sessions: [] })
    expect(ls.getItem(KEYS.plan)).toBeNull()
    expect(JSON.parse(ls.getItem(KEYS.strava)!)).toEqual({ handled: ['9'], tokens: { accessToken: 'secret' } })
  })

  it('changes nothing if the browser refuses part of it', () => {
    const before = new Map(ls.map)
    const b = makeBackup()
    let writes = 0
    const real = ls.setItem
    ls.setItem = (k, v) => {
      if (++writes === 2) throw new DOMException('full', 'QuotaExceededError')
      real(k, v)
    }
    expect(() => restoreBackup(b)).toThrow(/hasn't been changed/)
    ls.setItem = real
    expect(new Map(ls.map)).toEqual(before)
  })
})

describe('backupDue', () => {
  const now = new Date('2026-11-04T12:00:00Z')
  it('waits until there is something worth keeping', () => {
    expect(backupDue({}, 4, now)).toBe(false)
    expect(backupDue({}, 5, now)).toBe(true)
  })
  it('nudges again once the last backup is old', () => {
    const days = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()
    expect(backupDue({ lastBackup: days(BACKUP_DUE_DAYS - 1) }, 50, now)).toBe(false)
    expect(backupDue({ lastBackup: days(BACKUP_DUE_DAYS) }, 50, now)).toBe(true)
  })
})
