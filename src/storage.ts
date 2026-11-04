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

/** Writes a JSON value; false (and a reported problem) if the browser refused. */
export function writeJson(key: string, value: unknown): boolean {
  const s = storage()
  if (!s) return false
  try {
    s.setItem(key, JSON.stringify(value))
    clearWriteProblem(key)
    return true
  } catch {
    report({ key, kind: 'write' })
    return false
  }
}

/**
 * useState backed by a localStorage key. Saves on every change, and reloads when
 * another tab saves the same key.
 */
export function useStoredState<T>(key: string, parse: (saved: Record<string, unknown>) => T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readJson(key, parse))
  const parseRef = useRef(parse)
  // What's in storage right now, as far as this tab knows; avoids writing back what was just read.
  const stored = useRef<string | null>(null)

  useEffect(() => {
    parseRef.current = parse
  })

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
