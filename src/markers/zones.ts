// Training zones per sport, worked out from that sport's fitness marker, so "zone 4" on a
// planned session becomes a real pace or wattage. Five zones everywhere, matching the five
// HR zones, so a zone number means the same thing in every sport.
//
// Where the numbers come from (coaching convention, not trial results; see docs/SPEC.md):
// - Run: Joe Friel's pace zones as % of threshold pace (time per km), with 5a–5c folded into 5
//   (anything faster than 99%, so it meets zone 4).
//   TrainingPeaks, "Joe Friel's Quick Guide to Setting Zones".
// - Bike: Andrew Coggan's power levels as % of FTP, with levels 5–7 folded into 5.
//   TrainingPeaks, "Power Training Levels".
// - Erg: the rowing bands as seconds added to the 2k split (/500m): UT2 +20–30, UT1 +12–18,
//   AT +5–10, TR ±2, AN 5s faster or more. Zone 1 is anything easier than UT2.
//   ErgManiac, "5 Indoor Rowing Training Zones Explained".
// - Swim: % of CSS speed, after Swim Smooth-style CSS zones as published by UltraSwim 33.3.

import type { Aim, Marker, MarkerKind, RelTarget, Sport, Target } from '../log/types'
import { isStale, MARKER_FOR_SPORT, type CurrentMarkers } from './markers'

export type ZoneSport = 'run' | 'bike' | 'erg' | 'swim'

/** How a zone table's numbers relate to the marker. */
export type ZoneScale = 'pctTime' | 'pctPower' | 'offsetSplit' | 'pctSpeed'

/** One zone: lower and upper number in the table's scale; either end can be open. */
export type ZoneBand = [lo: number | null, hi: number | null]

export interface ZoneTableDef {
  sport: ZoneSport
  scale: ZoneScale
  /** What the numbers mean, for the table header. */
  unit: string
  names: string[]
  bands: ZoneBand[]
  source: string
}

export const ZONE_TABLES: Record<ZoneSport, ZoneTableDef> = {
  run: {
    sport: 'run',
    scale: 'pctTime',
    unit: '% of threshold pace (time per km: above 100 is slower)',
    names: ['Recovery', 'Aerobic', 'Tempo', 'Threshold', 'Above threshold'],
    bands: [
      [129, null],
      [114, 129],
      [106, 113],
      [99, 105],
      [null, 99],
    ],
    source: 'Friel pace zones (TrainingPeaks)',
  },
  bike: {
    sport: 'bike',
    scale: 'pctPower',
    unit: '% of FTP',
    names: ['Active recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2max and above'],
    bands: [
      [null, 55],
      [56, 75],
      [76, 90],
      [91, 105],
      [106, null],
    ],
    source: 'Coggan power levels (TrainingPeaks)',
  },
  erg: {
    sport: 'erg',
    scale: 'offsetSplit',
    unit: 'seconds added to your 2k split /500m',
    names: ['Recovery', 'UT2', 'UT1', 'AT', 'TR / AN'],
    bands: [
      [31, null],
      [20, 30],
      [12, 18],
      [5, 10],
      [null, 2],
    ],
    source: 'Rowing training bands (ErgManiac)',
  },
  swim: {
    sport: 'swim',
    scale: 'pctSpeed',
    unit: '% of CSS speed',
    names: ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'Above threshold'],
    bands: [
      [77, 87],
      [87, 94],
      [95, 98],
      [99, 104],
      [105, null],
    ],
    source: 'CSS zones (UltraSwim 33.3)',
  },
}

export const ZONE_SPORTS = Object.keys(ZONE_TABLES) as ZoneSport[]

export const isZoneSport = (s: Sport): s is ZoneSport => s in ZONE_TABLES

/** Hand-edited bands from Settings, falling back to the defaults. */
export type ZoneOverrides = Partial<Record<ZoneSport, ZoneBand[]>>

export function bandsFor(sport: ZoneSport, overrides?: ZoneOverrides): ZoneBand[] {
  const own = overrides?.[sport]
  return own?.length === 5 ? own : ZONE_TABLES[sport].bands
}

/** Everything needed to turn zones and relative targets into numbers. */
export interface ZoneContext {
  markers: CurrentMarkers
  overrides?: ZoneOverrides
  today: string
}

/** The 2k split in s/500m from a 2k time. */
export const splitOf2k = (sec2k: number) => sec2k / 4

/** The marker's value in s/km (paces) or watts (FTP): the number zones scale from. */
function base(kind: MarkerKind, value: number) {
  return kind === 'erg2k' ? splitOf2k(value) * 2 : value
}

const pct = (n: number | null) => (n == null ? undefined : n / 100)

/** Derived paces round to whole seconds of the unit they're read in: /km, /500m, /100m (in s/km). */
const PACE_STEP: Partial<Record<Sport, number>> = { run: 1, erg: 2, swim: 10 }

/** A zone of one sport as a target, from the marker's value. */
export function zoneTarget(sport: ZoneSport, zone: number, markerValue: number, overrides?: ZoneOverrides): Target | undefined {
  const band = bandsFor(sport, overrides)[zone - 1]
  if (!band) return undefined
  const [lo, hi] = band
  const kind = MARKER_FOR_SPORT[sport]!
  const b = base(kind, markerValue)
  const step = PACE_STEP[sport] ?? 1
  const round = (v: number | undefined) => (v == null ? undefined : Math.round(v / step) * step)
  switch (ZONE_TABLES[sport].scale) {
    case 'pctPower':
      return { metric: 'power', min: lo == null ? undefined : Math.round(b * pct(lo)!), max: hi == null ? undefined : Math.round(b * pct(hi)!) }
    case 'pctTime':
      // A bigger % of threshold time is a slower (bigger s/km) pace.
      return { metric: 'pace', min: round(lo == null ? undefined : b * pct(lo)!), max: round(hi == null ? undefined : b * pct(hi)!) }
    case 'pctSpeed':
      // A bigger % of CSS speed is a faster (smaller s/km) pace.
      return { metric: 'pace', min: round(hi == null ? undefined : b / pct(hi)!), max: round(lo == null ? undefined : b / pct(lo)!) }
    case 'offsetSplit':
      // Seconds per 500m, doubled to s/km.
      return { metric: 'pace', min: round(lo == null ? undefined : b + lo * 2), max: round(hi == null ? undefined : b + hi * 2) }
  }
}

/** Seconds per display distance that a pace offset is typed in: /km run, /500m erg, /100m swim. */
const OFFSET_PER_KM: Partial<Record<Sport, number>> = { run: 1, erg: 2, swim: 10 }

/** What a relative target is measured against, for labels: "% FTP", "s vs 2k split". */
export function relLabel(sport: Sport): string | undefined {
  if (sport === 'bike') return '% FTP'
  if (sport === 'run') return 's/km vs threshold'
  if (sport === 'erg') return 's/500m vs 2k split'
  if (sport === 'swim') return 's/100m vs CSS'
  return undefined
}

/** A relative target as a fixed one, from the marker's value. */
export function relTarget(sport: Sport, rel: RelTarget, markerValue: number): Target | undefined {
  const kind = MARKER_FOR_SPORT[sport]
  if (!kind || (rel.lo == null && rel.hi == null)) return undefined
  const b = base(kind, markerValue)
  if (sport === 'bike') {
    return { metric: 'power', min: rel.lo == null ? undefined : Math.round((b * rel.lo) / 100), max: rel.hi == null ? undefined : Math.round((b * rel.hi) / 100) }
  }
  const k = OFFSET_PER_KM[sport]!
  const step = PACE_STEP[sport] ?? 1
  const at = (off: number | undefined) => (off == null ? undefined : Math.round((b + off * k) / step) * step)
  // Two offsets make a range; one means "this pace or faster".
  if (rel.lo != null && rel.hi != null) return { metric: 'pace', min: at(Math.min(rel.lo, rel.hi)), max: at(Math.max(rel.lo, rel.hi)) }
  return { metric: 'pace', max: at(rel.lo ?? rel.hi) }
}

/** "105% FTP", "2k split +4s", "threshold −5s/km": a relative target in words. */
export function describeRel(sport: Sport, rel: RelTarget): string {
  const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0')
  const vals = [rel.lo, rel.hi].filter((v): v is number => v != null)
  if (!vals.length) return ''
  if (sport === 'bike') return `${vals.join('–')}% FTP`
  const name = sport === 'run' ? 'threshold' : sport === 'erg' ? '2k split' : sport === 'swim' ? 'CSS' : 'marker'
  const unit = sport === 'run' ? 's/km' : 's'
  return `${name} ${vals.map(sign).join(' to ')}${unit}`
}

export interface Resolved {
  target: Target
  /** Worked out from a zone or relative target rather than set by hand. */
  derived: boolean
  /** The marker it came from is old enough that a re-test is due. */
  stale: boolean
  marker?: Marker
}

/**
 * The numbers an aim really asks for: its fixed target if it has one; else its relative
 * target or its zone, worked out from the sport's current marker. Undefined when there's
 * nothing to go on (no marker yet), in which case HR zone and RPE stay the guide.
 */
export function resolveAim(a: Aim, sport: Sport, ctx: ZoneContext | undefined): Resolved | undefined {
  if (a.target) return { target: a.target, derived: false, stale: false }
  if (!ctx || !isZoneSport(sport)) return undefined
  const kind = MARKER_FOR_SPORT[sport]!
  const marker = ctx.markers[kind]
  if (!marker) return undefined
  const target = a.rel ? relTarget(sport, a.rel, marker.value) : a.hrZone ? zoneTarget(sport, a.hrZone, marker.value, ctx.overrides) : undefined
  return target ? { target, derived: true, stale: isStale(marker, ctx.today), marker } : undefined
}

/** An aim with its relative or zone target written in as numbers, for a session being logged. */
export function fixAim<A extends Aim>(a: A, sport: Sport, ctx: ZoneContext | undefined): A {
  const r = resolveAim(a, sport, ctx)
  const { rel: _rel, ...rest } = a
  return { ...rest, target: r?.target ?? a.target } as A
}
