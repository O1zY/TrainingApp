import { zonesFromMax } from './hrZones'
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { KEYS, useStoredState } from '../storage'

export type ThemePref = 'system' | 'light' | 'dark'
export type Units = 'metric' | 'imperial'

export interface Settings {
  theme: ThemePref
  units: Units
  /** 1 = Monday. Training weeks start on Monday by default. */
  weekStartsOn: 0 | 1
  maxHR: number
  /** Top bpm of HR zones 1–4; zone 5 runs from the last one to max. */
  hrZoneTops: number[]
}

const DEFAULTS: Settings = { theme: 'system', units: 'metric', weekStartsOn: 1, maxHR: 195, hrZoneTops: zonesFromMax(195) }

// Settings live in localStorage (via src/storage.ts) until the database section is built.
function parseSettings(saved: Record<string, unknown>): Settings {
  const s = { ...DEFAULTS, ...saved }
  if (!Array.isArray(s.hrZoneTops) || s.hrZoneTops.length !== 4) s.hrZoneTops = zonesFromMax(Number(s.maxHR) || DEFAULTS.maxHR)
  return s
}

interface SettingsValue {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

const SettingsContext = createContext<SettingsValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useStoredState(KEYS.settings, parseSettings)

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings.theme])

  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }))

  return <SettingsContext.Provider value={{ settings, update }}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
