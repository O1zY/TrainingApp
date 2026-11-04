import { KEYS, readJson, replaceStored, writeJson, type StoreKey } from '../storage'
import { equal, mergeStores } from './merge'

// One sync: bring every store on this device and in the account into line.
// The account keeps one row per store: its data and a revision number that goes up by one
// on every write. A write only lands if the revision is still the one this device last
// saw, so two devices can never silently overwrite each other: the loser pulls again,
// merges and retries. `tt-sync-base` remembers, per store, the copy and revision this
// device last agreed with the account; that's the "base" the three-way merge needs.

type Obj = Record<string, unknown>

export interface Row {
  key: string
  data: Obj
  rev: number
}

export interface Remote {
  pull(): Promise<Row[]>
  /** Writes `data` as revision `expectRev + 1` (0 = first write). False if the account moved on. */
  push(key: string, data: Obj, expectRev: number): Promise<boolean>
}

export const SYNCED: StoreKey[] = [KEYS.settings, KEYS.log, KEYS.plan, KEYS.strava]
export const BASE_KEY = 'tt-sync-base'

type Base = Partial<Record<string, { rev: number; data: Obj }>>

export interface SyncReport {
  at: string
  /** Stores this device sent changes for. */
  sent: string[]
  /** Stores that took in changes from the account. */
  received: string[]
  /** Stores left for next time because an edit was mid-save. */
  deferred: string[]
}

function readLocal(key: string): Obj | undefined {
  let found: Obj | undefined
  readJson(key, (saved) => {
    found = Object.keys(saved).length ? saved : undefined
    return saved
  })
  return found
}

/** What may leave the device: Strava tokens stay on the device that connected. */
export function shareable(key: string, v: Obj): Obj {
  if (key !== KEYS.strava) return v
  const { tokens: _tokens, ...rest } = v
  return rest
}

/** Puts back what stays on this device into a merged copy. */
function withLocalOnly(key: string, merged: Obj, local: Obj | undefined): Obj {
  if (key !== KEYS.strava || !local?.tokens) return merged
  return { ...merged, tokens: local.tokens }
}

/**
 * Fix-ups after a merge. Two devices importing from Strava at the same time can each
 * make a session for the same activity; keep the more recently updated one.
 */
export function tidy(key: string, v: Obj): Obj {
  if (key !== KEYS.log || !Array.isArray(v.sessions)) return v
  const best = new Map<string, Obj>()
  for (const s of v.sessions as Obj[]) {
    const ext = typeof s?.externalId === 'string' ? s.externalId : undefined
    if (!ext) continue
    const had = best.get(ext)
    if (!had || String(s.updatedAt ?? '') > String(had.updatedAt ?? '')) best.set(ext, s)
  }
  if ([...best.values()].length === (v.sessions as Obj[]).filter((s) => typeof s?.externalId === 'string').length) return v
  return { ...v, sessions: (v.sessions as Obj[]).filter((s) => typeof s?.externalId !== 'string' || best.get(s.externalId as string) === s) }
}

const readBase = (): Base => readJson<Base>(BASE_KEY, (saved) => saved as Base)

export async function syncOnce(remote: Remote, now = () => new Date()): Promise<SyncReport> {
  const report: SyncReport = { at: '', sent: [], received: [], deferred: [] }
  let rows = new Map((await remote.pull()).map((r) => [r.key, r]))
  const base = readBase()

  for (const key of SYNCED) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const localFull = readLocal(key)
      const local = localFull && shareable(key, localFull)
      const row = rows.get(key)
      const was = base[key]

      if (!row) {
        if (!local) break
        if (await remote.push(key, local, 0)) {
          base[key] = { rev: 1, data: local }
          report.sent.push(key)
          break
        }
        rows = new Map((await remote.pull()).map((r) => [r.key, r]))
        continue
      }

      // Unchanged in the account since last time: this device's copy is the latest.
      const merged = tidy(key, !local ? row.data : was && was.rev === row.rev ? local : mergeStores(was?.data, local, row.data))

      // Everything below up to the push runs without waiting, so no edit can slip in between.
      if (!local || !equal(merged, local)) {
        if (!replaceStored(key, withLocalOnly(key, merged, localFull))) {
          report.deferred.push(key)
          break
        }
        report.received.push(key)
      }
      if (equal(merged, row.data)) {
        base[key] = { rev: row.rev, data: merged }
        break
      }
      if (await remote.push(key, merged, row.rev)) {
        base[key] = { rev: row.rev + 1, data: merged }
        report.sent.push(key)
        break
      }
      // Another device wrote first: pull and merge again on top of theirs.
      rows = new Map((await remote.pull()).map((r) => [r.key, r]))
    }
  }

  // If this can't be saved the next sync falls back to combining copies, which is safe.
  writeJson(BASE_KEY, base)
  const once = (l: string[]) => [...new Set(l)]
  return { at: now().toISOString(), sent: once(report.sent), received: once(report.received), deferred: once(report.deferred) }
}

/** Forgets what was last agreed with the account (on sign-out). */
export function forgetBase() {
  try {
    localStorage.removeItem(BASE_KEY)
  } catch {
    // Nothing to do.
  }
}
