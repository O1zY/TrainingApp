import { beforeEach, describe, expect, it } from 'vitest'
import { KEYS } from '../storage'
import { installMemoryStorage } from '../test/memoryStorage'
import { BASE_KEY, syncOnce, tidy, type Remote, type Row } from './engine'

type Obj = Record<string, unknown>

/** An in-memory account, shared by "devices" (each a separate localStorage). */
class FakeAccount {
  rows = new Map<string, Row>()
  /** Runs once before the next push lands, to simulate another device writing first. */
  beforePush?: () => void
  remote(): Remote {
    return {
      pull: async () => [...this.rows.values()].map((r) => structuredClone(r)),
      push: async (key, data, expectRev) => {
        const hook = this.beforePush
        this.beforePush = undefined
        hook?.()
        const cur = this.rows.get(key)
        if ((cur?.rev ?? 0) !== expectRev) return false
        this.rows.set(key, { key, data: structuredClone(data), rev: expectRev + 1 })
        return true
      },
    }
  }
}

const session = (id: string, x: Obj = {}) => ({ id, date: '2026-11-01', updatedAt: '2026-11-01T00:00:00Z', ...x })

/** Each device keeps its own storage; switch between them by swapping the map. */
function devices() {
  const ls = installMemoryStorage()
  const saved = new Map<string, Map<string, string>>()
  let current = 'phone'
  return {
    ls,
    use(name: string) {
      saved.set(current, new Map(ls.map))
      ls.map.clear()
      for (const [k, v] of saved.get(name) ?? []) ls.map.set(k, v)
      current = name
    },
    get: (key: string) => JSON.parse(ls.getItem(key) ?? 'null'),
    set: (key: string, v: unknown) => ls.setItem(key, JSON.stringify(v)),
  }
}

let d: ReturnType<typeof devices>
let account: FakeAccount
beforeEach(() => {
  d = devices()
  account = new FakeAccount()
})

describe('syncOnce', () => {
  it('uploads a first device, then a new device downloads it', async () => {
    d.set(KEYS.log, { sessions: [session('a')] })
    const r1 = await syncOnce(account.remote())
    expect(r1.sent).toEqual([KEYS.log])
    expect(account.rows.get(KEYS.log)!.rev).toBe(1)

    d.use('laptop')
    const r2 = await syncOnce(account.remote())
    expect(r2.received).toEqual([KEYS.log])
    expect(d.get(KEYS.log).sessions).toEqual([session('a')])
  })

  it('combines sessions logged on two devices between syncs, and carries deletes over', async () => {
    d.set(KEYS.log, { sessions: [session('a'), session('b')] })
    await syncOnce(account.remote())
    d.use('laptop')
    await syncOnce(account.remote())

    // Laptop deletes b and logs c; phone logs p.
    d.set(KEYS.log, { sessions: [session('a'), session('c')] })
    await syncOnce(account.remote())
    d.use('phone')
    d.set(KEYS.log, { sessions: [session('a'), session('b'), session('p')] })
    await syncOnce(account.remote())
    expect(d.get(KEYS.log).sessions.map((s: Obj) => s.id)).toEqual(['a', 'p', 'c'])

    d.use('laptop')
    await syncOnce(account.remote())
    expect(d.get(KEYS.log).sessions.map((s: Obj) => s.id)).toEqual(['a', 'p', 'c'])
    expect(account.rows.get(KEYS.log)!.rev).toBe(3)
  })

  it('does nothing when nothing changed', async () => {
    d.set(KEYS.plan, { planned: [] })
    await syncOnce(account.remote())
    const r = await syncOnce(account.remote())
    expect(r.sent).toEqual([])
    expect(r.received).toEqual([])
  })

  it('retries on top of another device that wrote in the meantime', async () => {
    d.set(KEYS.log, { sessions: [session('a')] })
    await syncOnce(account.remote())
    d.set(KEYS.log, { sessions: [session('a'), session('mine')] })
    account.beforePush = () => {
      const row = account.rows.get(KEYS.log)!
      account.rows.set(KEYS.log, { ...row, rev: row.rev + 1, data: { sessions: [session('a'), session('theirs')] } })
    }
    await syncOnce(account.remote())
    expect(account.rows.get(KEYS.log)!.data.sessions).toEqual([session('a'), session('mine'), session('theirs')])
    expect(d.get(KEYS.log).sessions).toEqual([session('a'), session('mine'), session('theirs')])
  })

  it('never uploads Strava tokens, and keeps this device’s tokens when taking changes in', async () => {
    d.set(KEYS.strava, { tokens: { access: 'secret' }, handled: ['1'] })
    await syncOnce(account.remote())
    expect(account.rows.get(KEYS.strava)!.data).toEqual({ handled: ['1'] })
    const row = account.rows.get(KEYS.strava)!
    account.rows.set(KEYS.strava, { ...row, rev: 2, data: { handled: ['1', '2'] } })
    await syncOnce(account.remote())
    expect(d.get(KEYS.strava)).toEqual({ handled: ['1', '2'], tokens: { access: 'secret' } })
  })

  it('remembers the agreed copy per store', async () => {
    d.set(KEYS.settings, { units: 'metric' })
    await syncOnce(account.remote())
    expect(d.get(BASE_KEY)[KEYS.settings]).toEqual({ rev: 1, data: { units: 'metric' } })
  })
})

describe('tidy', () => {
  it('keeps one session per Strava activity, the latest edited', () => {
    const v = tidy(KEYS.log, {
      sessions: [session('x1', { externalId: 'strava:9' }), session('m'), session('x2', { externalId: 'strava:9', updatedAt: '2026-11-02T00:00:00Z' })],
    })
    expect((v.sessions as Obj[]).map((s) => s.id)).toEqual(['m', 'x2'])
  })
})
