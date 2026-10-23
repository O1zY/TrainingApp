import { useEffect, useState } from 'react'

/**
 * Morning check-in, one per day. Sleep and overnight numbers mirror Garmin's
 * morning report so they can be imported later; soreness and energy are
 * always entered by hand.
 */
export interface CheckIn {
  /** Local date, YYYY-MM-DD. */
  date: string
  sleepS?: number
  /** Garmin sleep score, 0–100. */
  sleepScore?: number
  restingHR?: number
  /** Overnight HRV in ms. */
  hrv?: number
  /** 1 = none … 5 = very sore. */
  soreness?: number
  /** 1 = drained … 5 = great. */
  energy?: number
  notes?: string
  source: 'manual' | 'garmin'
}

export const SORENESS = ['None', 'Slight', 'Moderate', 'Sore', 'Very sore']
export const ENERGY = ['Drained', 'Low', 'OK', 'Good', 'Great']

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const STORAGE_KEY = 'tt-checkins'

// Check-ins live in localStorage until the database section is built.
function load(): Record<string, CheckIn> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function useCheckIns() {
  const [all, setAll] = useState<Record<string, CheckIn>>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    } catch {
      // Storage can be unavailable (private mode); the check-in still shows for this visit.
    }
  }, [all])

  const save = (c: CheckIn) => setAll((a) => ({ ...a, [c.date]: c }))
  return { all, save }
}
