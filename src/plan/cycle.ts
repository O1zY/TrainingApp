import { addDays, daysBetween } from './dates'
import { covers } from './events'
import type { Block, PlanEvent, WeekKind } from './types'

export interface PlanWeek {
  start: string
  /** 0-based week of the block. */
  index: number
  kind: WeekKind
  /** 1, 2, 3 for build weeks: how far into the current cycle. */
  buildNo?: number
  /** Training volume relative to the first build week. */
  volume: number
  /** Set by hand rather than worked out. */
  overridden: boolean
  races: PlanEvent[]
  /** Days of the week covered by an 'away' event. */
  awayDays: number
  /** Why the week is what it is, in plain words. */
  notes: string[]
}

export const WEEK_KINDS: { value: WeekKind; label: string; short: string; hint: string }[] = [
  { value: 'build', label: 'Build', short: 'B', hint: 'Volume steps up each build week' },
  { value: 'deload', label: 'Deload', short: 'D', hint: 'Less volume, one test or benchmark, absorb the block' },
  { value: 'taper', label: 'Taper', short: 'T', hint: 'Volume down, intensity kept, arrive fresh' },
  { value: 'race', label: 'Race', short: 'R', hint: 'Short sharpener, race, little else' },
  { value: 'recovery', label: 'Recovery', short: 'Rc', hint: 'Easy only after a big race' },
]

export const kindDef = (k: WeekKind) => WEEK_KINDS.find((x) => x.value === k)!

/** Literal classes so Tailwind keeps them. */
export const KIND_STYLE: Record<WeekKind, { bg: string; soft: string; text: string }> = {
  build: { bg: 'bg-phase-build', soft: 'bg-phase-build/15', text: 'text-phase-build' },
  deload: { bg: 'bg-phase-deload', soft: 'bg-phase-deload/15', text: 'text-phase-deload' },
  taper: { bg: 'bg-phase-taper', soft: 'bg-phase-taper/15', text: 'text-phase-taper' },
  race: { bg: 'bg-phase-race', soft: 'bg-phase-race/15', text: 'text-phase-race' },
  recovery: { bg: 'bg-phase-deload', soft: 'bg-phase-deload/15', text: 'text-phase-deload' },
}

export function weekLabel(w: Pick<PlanWeek, 'kind' | 'buildNo'>) {
  return w.kind === 'build' ? `Build ${w.buildNo}` : kindDef(w.kind).label
}

/**
 * Works out each week of a block. The rhythm is `buildWeeks` build weeks then a deload,
 * bent around what's going on:
 * - A race: taper week before, race week, recovery week after; the rhythm restarts after.
 * - B race: a lighter race week, the rhythm carries on.
 * - C race: trained through; it just takes a key session's place.
 * - Away four or more days: that week becomes the deload and the rhythm restarts.
 * - A deload due the week before a taper is skipped, as the taper does its job.
 * Weeks set by hand always win and the rhythm counts on from them.
 */
export function blockWeeks(block: Pick<Block, 'start' | 'weeks' | 'buildWeeks' | 'progressionPct' | 'deloadPct' | 'weekKinds'>, events: PlanEvent[]): PlanWeek[] {
  const end = addDays(block.start, block.weeks * 7 - 1)
  const weeks: PlanWeek[] = Array.from({ length: block.weeks }, (_, i) => {
    const start = addDays(block.start, i * 7)
    const days = Array.from({ length: 7 }, (_, d) => addDays(start, d))
    return {
      start,
      index: i,
      kind: 'build',
      volume: 1,
      overridden: false,
      races: events.filter((e) => e.kind === 'race' && days.includes(e.date)),
      awayDays: days.filter((d) => events.some((e) => e.kind === 'away' && covers(e, d))).length,
      notes: [],
    }
  })
  const preset: (WeekKind | undefined)[] = Array(block.weeks).fill(undefined)

  for (const race of events.filter((e) => e.kind === 'race' && e.date >= block.start && e.date <= end)) {
    const r = Math.floor(daysBetween(block.start, race.date) / 7)
    if (race.priority === 'A') {
      preset[r] = 'race'
      weeks[r].notes.push(`${race.name} (A race)`)
      if (r > 0 && !preset[r - 1]) {
        preset[r - 1] = 'taper'
        weeks[r - 1].notes.push(`Taper for ${race.name}`)
      }
      if (r + 1 < block.weeks && !preset[r + 1]) {
        preset[r + 1] = 'recovery'
        weeks[r + 1].notes.push(`Recover from ${race.name}; the cycle restarts after`)
      }
    } else if (race.priority === 'B') {
      preset[r] ??= 'race'
      weeks[r].notes.push(`${race.name} (B race): lighter week, cycle carries on`)
    } else {
      weeks[r].notes.push(`${race.name} (C race): trained through`)
    }
  }

  weeks.forEach((w, i) => {
    if (!preset[i] && w.awayDays >= 4) {
      preset[i] = 'deload'
      w.notes.push(`Away ${w.awayDays} days, so the deload moves here`)
    }
  })

  let counter = 0
  weeks.forEach((w, i) => {
    const manual = block.weekKinds?.[w.start]
    let kind = manual ?? preset[i]
    if (manual) {
      w.overridden = true
      w.notes.unshift('Set by hand')
    }
    if (!kind) {
      kind = counter >= block.buildWeeks ? 'deload' : 'build'
      const next = block.weekKinds?.[weeks[i + 1]?.start] ?? preset[i + 1]
      if (kind === 'deload' && (next === 'taper' || next === 'race' || next === 'deload')) {
        kind = 'build'
        w.notes.push(next === 'deload' ? 'Deload pushed back a week' : 'Deload skipped: the taper does its job')
      }
    }
    w.kind = kind
    if (kind === 'build') w.buildNo = ++counter
    else if (kind === 'deload' || kind === 'recovery') counter = 0
    // Taper and race weeks leave the count where it is.
  })

  const step = block.progressionPct / 100
  const peak = Math.max(1, ...weeks.filter((w) => w.kind === 'build').map((w) => 1 + step * (w.buildNo! - 1)))
  for (const w of weeks) {
    const aRace = w.races.some((r) => r.priority === 'A')
    w.volume =
      w.kind === 'build'
        ? 1 + step * (w.buildNo! - 1)
        : w.kind === 'deload'
          ? block.deloadPct / 100
          : w.kind === 'taper'
            ? 0.7 * peak
            : w.kind === 'race'
              ? aRace ? 0.5 : 0.8
              : 0.5
  }
  return weeks
}
