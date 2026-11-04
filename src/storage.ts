import { useEffect, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react'

// Everything the app keeps lives in localStorage under these keys, until there's a database.
// The stores read and write through this file so they all get the same safety net:
//  - a save that can't be read back is set aside under a `.corrupt` key, never silently replaced;
//  - a failed write (storage full or blocked) is reported, so the app can say so;
//  - another tab's saves are picked up, so two open tabs don't overwrite each other.

export const KEYS = {
  settings: 'tt-settings',
  log: 'tt-log-v1',
  plan: 'tt-plan-v1',
  strava: 'tt-strava-v1',
} as const
export type StoreKey = (typeof KEYS)[keyof typeof KEYS]

/** Not training data: when the last backup was made, etc. */
export const META_KEY = 'tt-meta'

export interface StorageProblem {
  key: string
  kind: 'corrupt' | 'write'
  /** Where an unreadable save was copied to. */
  savedAs?: string
  at: string
}

let problems: StorageProblem[] = []
const listeners = new Set<() => void>()

function report(p: Omit<StorageProblem, 'at'>) {
  // One entry per key and kind; the latest wins.
  problems = [...problems.filter((x) => !(x.key === p.key && x.kind === p.kind)), { ...p, at: new Date().toISOString() }]
  listeners.forEach((l) => l())
}

function clearWriteProblem(key: string) {
  if (!problems.some((p) => p.key === key && p.kind === 'write')) return
  problems = problems.filter((p) => !(p.key === key && p.kind === 'write'))
  listeners.forEach((l) => l())
}

export function dismissProblems() {
  problems = problems.filter((p) => p.kind === 'write')
  listeners.forEach((l) => l())
}

export function useStorageProblems() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => problems,
  )
}

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/**
 * Reads a JSON value. Missing → `parse({})`. Unreadable → the raw text is copied to
 * `<key>.corrupt-<time>` and reported, then `parse({})` is returned, so the next save
 * can't destroy the only copy.
 */
export function readJson<T>(key: string, parse: (saved: Record<string, unknown>) => T): T {
  const raw = storage()?.getItem(key)
  if (raw == null) return parse({})
  try {
    const saved = JSON.parse(raw)
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('not an object')
    return parse(saved)
  } catch {
    const savedAs = `${key}.corrupt-${Date.now()}`
    try {
      storage()?.setItem(savedAs, raw)
      report({ key, kind: 'corrupt', savedAs })
    } catch {
      report({ key, kind: 'corrupt' })
    }
    return parse({})
  }
}

const writeListeners = new Set<(key: string) => void>()

/** Hears about every successful save (sync uses it to know there's something to send). */
export function onWrite(listener: (key: string) => void) {
  writeListeners.add(listener)
  return () => void writeListeners.delete(listener)
}

/** Writes a JSON value; false (and a reported problem) if the browser refused. */
export function writeJson(key: string, value: unknown): boolean {
  const s = storage()
  if (!s) return false
  try {
    s.setItem(key, JSON.stringify(value))
    clearWriteProblem(key)
    writeListeners.forEach((l) => l(key))
    return true
  } catch {
    report({ key, kind: 'write' })
    return false
  }
}

/** Live stores in this tab, by key, so a value replaced from outside (sync) shows at once. */
interface Mounted {
  /** True while the store has a change not yet saved. */
  unsaved: () => boolean
  reload: () => void
}
const mounted = new Map<string, Set<Mounted>>()

/**
 * Replaces a stored value from outside the app's own editing (e.g. what sync merged in),
 * updating any live store for that key. Refuses (false) when a store has an edit that
 * hasn't been saved yet, so nothing typed is overwritten; try again shortly.
 */
export function replaceStored(key: string, value: unknown): boolean {
  const live = mounted.get(key) ?? new Set()
  if ([...live].some((m) => m.unsaved())) return false
  if (!writeJson(key, value)) return false
  live.forEach((m) => m.reload())
  return true
}

/**
 * useState backed by a localStorage key. Saves on every change, and reloads when
 * another tab saves the same key or sync replaces it.
 */
export function useStoredState<T>(key: string, parse: (saved: Record<string, unknown>) => T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readJson(key, parse))
  const parseRef = useRef(parse)
  const valueRef = useRef(value)
  // What's in storage right now, as far as this tab knows; avoids writing back what was just read.
  const stored = useRef<string | null>(null)

  useEffect(() => {
    parseRef.current = parse
    valueRef.current = value
  })

  useEffect(() => {
    const m: Mounted = {
      unsaved: () => stored.current !== null && JSON.stringify(valueRef.current) !== stored.current,
      reload: () => {
        const next = readJson(key, parseRef.current)
        // Matches what's saved (give or take defaults), so it isn't written straight back.
        stored.current = JSON.stringify(next)
        valueRef.current = next
        setValue(next)
      },
    }
    const set = mounted.get(key) ?? new Set()
    set.add(m)
    mounted.set(key, set)
    return () => void set.delete(m)
  }, [key])

  useEffect(() => {
    const text = JSON.stringify(value)
    if (text === stored.current) return
    if (writeJson(key, value)) stored.current = text
  }, [key, value])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || e.storageArea !== storage()) return
      stored.current = e.newValue
      setValue(readJson(key, parseRef.current))
    }
    addEventListener('storage', onStorage)
    return () => removeEventListener('storage', onStorage)
  }, [key])

  return [value, setValue]
}

/** Asks the browser not to clear this site's storage when space runs low. */
export async function requestPersistence(): Promise<boolean | undefined> {
  try {
    if (!navigator.storage?.persist) return undefined
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return undefined
  }
}

export async function storageInfo(): Promise<{ persisted?: boolean; usage?: number; quota?: number }> {
  try {
    const [persisted, est] = await Promise.all([navigator.storage?.persisted?.(), navigator.storage?.estimate?.()])
    return { persisted, usage: est?.usage, quota: est?.quota }
  } catch {
    return {}
  }
}

/**
 * Lays a saved object over the defaults, but only keeps saved values whose shape matches:
 * an array field that isn't an array falls back to the default, so one bad field can't
 * crash every page that maps over it.
 */
export function withArrays<T extends object>(defaults: T, saved: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...defaults, ...saved }
  for (const [k, v] of Object.entries(defaults)) if (Array.isArray(v) && !Array.isArray(out[k])) out[k] = v
  return out as T
}
