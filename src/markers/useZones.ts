import { useMemo } from 'react'
import { todayIso } from '../log/format'
import { useLog, type MarkerDraft } from '../log/LogStore'
import { useSettings } from '../settings/SettingsContext'
import { zonesFromMax } from '../settings/hrZones'
import { currentMarker, currentMarkers } from './markers'
import type { ZoneContext } from './zones'

/** Current markers and zone settings, for turning zones into paces and watts. */
export function useZoneContext(): ZoneContext {
  const { markers } = useLog()
  const { settings } = useSettings()
  return useMemo(() => ({ markers: currentMarkers(markers), overrides: settings.zones, today: todayIso() }), [markers, settings.zones])
}

/** Saves a marker; a new current max HR also resets Settings' max, and HR zones still on the defaults. */
export function useSaveMarker() {
  const { markers, saveMarker } = useLog()
  const { settings, update } = useSettings()
  return (draft: MarkerDraft) => {
    const saved = saveMarker(draft)
    const cur = currentMarker(markers, 'maxHr')
    if (draft.kind === 'maxHr' && (!cur || draft.date >= cur.date)) {
      const onDefaults = settings.hrZoneTops.every((t, i) => t === zonesFromMax(settings.maxHR)[i])
      update({ maxHR: draft.value, ...(onDefaults ? { hrZoneTops: zonesFromMax(draft.value) } : {}) })
    }
    return saved
  }
}
