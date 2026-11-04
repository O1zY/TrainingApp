import { KEYS, META_KEY, readJson, writeJson, type StoreKey } from './storage'

// Backups: everything the app keeps, in one JSON file the user downloads and can restore
// later (into this browser or another). Strava tokens are left out, because the file is
// easy to pass around and the tokens give access to the Strava account; after a restore
// into a new browser you reconnect Strava, and what was already imported stays deduped.

export const BACKUP_APP = 'training-tracker'
export const BACKUP_VERSION = 1
/** Suggest a new backup after this many days, once there's something worth keeping. */
export const BACKUP_DUE_DAYS = 14

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  data: Partial<Record<StoreKey, Record<string, unknown>>>
}

export interface BackupSummary {
  exportedAt: string
  sessions: number
  checkIns: number
  workouts: number
  planned: number
  blocks: number
  firstDate?: string
  lastDate?: string
}

interface Meta {
  lastBackup?: string
}

const STORE_KEYS = Object.values(KEYS) as StoreKey[]

function rawObject(key: string): Record<string, unknown> | undefined {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    const v = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : undefined
  } catch {
    return undefined
  }
}

/** Removes anything that shouldn't leave the browser. */
function shareable(key: StoreKey, value: Record<string, unknown>) {
  if (key !== KEYS.strava) return value
  const { tokens: _tokens, ...rest } = value
  return rest
}

export function makeBackup(now = new Date()): Backup {
  const data: Backup['data'] = {}
  for (const key of STORE_KEYS) {
    const v = rawObject(key)
    if (v) data[key] = shareable(key, v)
  }
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), data }
}

const len = (v: unknown) => (Array.isArray(v) ? v.length : 0)

export function summarise(backup: Backup): BackupSummary {
  const log = backup.data[KEYS.log] ?? {}
  const plan = backup.data[KEYS.plan] ?? {}
  const dates = (Array.isArray(log.sessions) ? log.sessions : [])
    .map((s) => (s && typeof s === 'object' ? (s as { date?: unknown }).date : undefined))
    .filter((d): d is string => typeof d === 'string')
    .sort()
  return {
    exportedAt: backup.exportedAt,
    sessions: len(log.sessions),
    checkIns: len(log.wellbeing),
    workouts: len(log.workouts),
    planned: len(plan.planned),
    blocks: len(plan.blocks),
    firstDate: dates[0],
    lastDate: dates.at(-1),
  }
}

/** Checks a file's text is one of our backups; throws a readable message if not. */
export function parseBackup(text: string): Backup {
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    throw new Error("That file isn't a backup: it isn't valid JSON.")
  }
  const b = v as Partial<Backup>
  if (!b || typeof b !== 'object' || b.app !== BACKUP_APP || !b.data || typeof b.data !== 'object') {
    throw new Error("That file isn't a Training Tracker backup.")
  }
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new Error('That backup was made by a newer version of the app.')
  }
  const data: Backup['data'] = {}
  for (const key of STORE_KEYS) {
    const part = (b.data as Record<string, unknown>)[key]
    if (part === undefined) continue
    if (!part || typeof part !== 'object' || Array.isArray(part)) throw new Error('That backup is damaged: part of it is unreadable.')
    data[key] = part as Record<string, unknown>
  }
  if (Object.keys(data).length === 0) throw new Error('That backup is empty.')
  return { app: BACKUP_APP, version: b.version, exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt : '', data }
}

/**
 * Replaces this browser's data with the backup's. A store missing from the backup is
 * cleared. The current Strava connection is kept, since backups never carry tokens.
 * The page should reload afterwards so every store re-reads.
 */
export function restoreBackup(backup: Backup): void {
  const tokens = rawObject(KEYS.strava)?.tokens
  const before = new Map(STORE_KEYS.map((k) => [k, localStorage.getItem(k)]))
  try {
    for (const key of STORE_KEYS) {
      let value = backup.data[key]
      if (key === KEYS.strava && tokens) value = { ...value, tokens }
      if (value) {
        if (!writeJson(key, value)) throw new Error("The browser wouldn't save the restored data (storage full?). Your data hasn't been changed.")
      } else localStorage.removeItem(key)
    }
  } catch (e) {
    // All or nothing: put back what was there.
    for (const [key, raw] of before) {
      try {
        if (raw == null) localStorage.removeItem(key)
        else localStorage.setItem(key, raw)
      } catch {
        // Best effort; the original value fitted before, so this should too.
      }
    }
    throw e
  }
}

export function downloadBackup(now = new Date()) {
  const backup = makeBackup(now)
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `training-tracker-backup-${now.toISOString().slice(0, 10)}.json`
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  markBackedUp(now)
}

export function readMeta(): Meta {
  return readJson<Meta>(META_KEY, (saved) => saved as Meta)
}

export function markBackedUp(now = new Date()) {
  writeJson(META_KEY, { ...readMeta(), lastBackup: now.toISOString() })
}

/** Days since the last backup, or undefined if there's never been one. */
export function daysSinceBackup(meta: Meta, now = new Date()): number | undefined {
  if (!meta.lastBackup) return undefined
  return Math.floor((now.getTime() - new Date(meta.lastBackup).getTime()) / 86_400_000)
}

/** True when there's data worth protecting and the last backup is missing or old. */
export function backupDue(meta: Meta, sessionCount: number, now = new Date()): boolean {
  if (sessionCount < 5) return false
  const days = daysSinceBackup(meta, now)
  return days === undefined || days >= BACKUP_DUE_DAYS
}
