import { useSyncExternalStore } from 'react'

// Whether the person chose "use without signing in" on the welcome screen. It lasts for the
// browser tab's session only, so the sign-in screen comes back next time the app is opened
// (that's the point of making it prominent), and signing out brings it straight back.

const KEY = 'tt-welcome-skipped'

function read(): boolean {
  try {
    return globalThis.sessionStorage?.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function write(on: boolean) {
  try {
    if (on) globalThis.sessionStorage?.setItem(KEY, '1')
    else globalThis.sessionStorage?.removeItem(KEY)
  } catch {
    // Private mode or blocked storage: the choice just won't outlive this page load.
  }
}

let skipped = read()
const listeners = new Set<() => void>()

function set(next: boolean) {
  if (skipped === next) return
  skipped = next
  write(next)
  listeners.forEach((l) => l())
}

export const skipWelcome = () => set(true)
/** Brings the welcome screen back (the "Sign in" buttons, and after signing out). */
export const openWelcome = () => set(false)

export function useWelcomeSkipped() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => skipped,
  )
}
