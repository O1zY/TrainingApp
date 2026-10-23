import { blankSession } from '../log/drafts'
import { distanceUnit, formatDistance, formatTime, newId } from '../log/format'
import type { SessionDraft, WorkoutDraft } from '../log/LogStore'
import { WOD_FORMATS, sessionName } from '../log/sports'
import { findMax } from '../log/stats'
import { describeAim } from '../log/targets'
import type { Aim, OneRepMax, PieceTemplate, Session, Sport, Workout } from '../log/types'
import type { Units } from '../settings/SettingsContext'

export function blankWorkout(sport: Sport = 'erg'): WorkoutDraft {
  return { name: '', sport, tags: [] }
}

const aimOf = (a: Aim): Aim => ({ target: a.target, hrZone: a.hrZone, targetRate: a.targetRate })

/** Rounds to the nearest 2.5kg plate jump, which is what a % of 1RM becomes on the bar. */
export const roundToPlates = (kg: number) => Math.round(kg / 2.5) * 2.5

/**
 * A log pre-filled from a workout. Only the fixed parts are filled in (a rep's set
 * distance or time, rest, targets, planned weights), so you just type what actually happened.
 */
export function sessionFromWorkout(w: Workout, maxes: OneRepMax[], date?: string): SessionDraft {
  const steady = !w.pieces?.length
  return {
    ...blankSession(w.sport, date),
    ...aimOf(w),
    type: w.type,
    title: w.name,
    workoutId: w.id,
    durationSec: steady ? w.durationSec : undefined,
    distanceM: steady ? w.distanceM : undefined,
    pieces: w.pieces?.map((p) => ({
      id: newId(),
      ...aimOf(p),
      // A distance rep's time is the result, and vice versa, so only the fixed one is copied.
      distanceM: p.distanceM,
      durationSec: p.distanceM ? undefined : p.durationSec,
      restSec: p.restSec,
      notes: p.notes,
    })),
    exercises: w.exercises?.map((e) => {
      const oneRm = findMax(maxes, e.name)?.kg
      return {
        id: newId(),
        name: e.name,
        oneRmKg: oneRm,
        notes: e.notes,
        sets: e.sets.map((s) => ({
          id: newId(),
          reps: s.reps,
          rpe: s.rpe,
          warmup: s.warmup,
          weightKg: s.pct != null && oneRm ? roundToPlates((s.pct / 100) * oneRm) : s.weightKg,
        })),
      }
    }),
    wod: w.wod ? { ...w.wod } : undefined,
  }
}

/** Turns a logged session into a library workout: its structure and targets, not its results. */
export function workoutFromSession(s: Session): WorkoutDraft {
  const steady = !s.pieces?.length
  return {
    ...aimOf(s),
    name: sessionName(s),
    sport: s.sport === 'transition' ? 'other' : s.sport,
    type: s.type,
    tags: [],
    durationSec: steady ? s.durationSec : undefined,
    distanceM: steady && !s.durationSec ? s.distanceM : undefined,
    pieces: s.pieces?.map((p) => ({
      id: newId(),
      ...aimOf(p),
      distanceM: p.distanceM,
      durationSec: p.distanceM ? undefined : p.durationSec,
      restSec: p.restSec,
      notes: p.notes,
    })),
    exercises: s.exercises?.map((e) => ({
      id: newId(),
      name: e.name,
      notes: e.notes,
      sets: e.sets.map((x) => ({
        id: newId(),
        reps: x.reps,
        rpe: x.rpe,
        warmup: x.warmup,
        ...(e.oneRmKg && x.weightKg ? { pct: Math.round((x.weightKg / e.oneRmKg) * 100) } : { weightKg: x.weightKg }),
      })),
    })),
    wod: s.wod ? { format: s.wod.format, description: s.wod.description, timeCapSec: s.wod.timeCapSec } : undefined,
  }
}

export function copyWorkout(w: Workout): WorkoutDraft {
  return {
    ...w,
    id: undefined,
    createdAt: undefined,
    name: `${w.name} (copy)`,
    pieces: w.pieces?.map((p) => ({ ...p, id: newId() })),
    exercises: w.exercises?.map((e) => ({ ...e, id: newId(), sets: e.sets.map((s) => ({ ...s, id: newId() })) })),
  }
}

// ---- Describing structure ---------------------------------------------------

/** 1200 → "20′", 90 → "1:30". Whole minutes read better as minutes in a plan. */
export function formatPlanTime(sec: number) {
  return sec >= 60 && sec % 60 === 0 ? `${sec / 60}′` : formatTime(sec, false)
}

export const pieceUnit = (sport: Sport, units: Units) => (sport === 'bike' ? distanceUnit(sport, units) : 'm')

/** Consecutive reps that are identical, so 8 matching rows read as "8 × 500m". */
export function groupPieces(pieces: PieceTemplate[]) {
  const key = (p: PieceTemplate) => JSON.stringify([p.distanceM, p.durationSec, p.restSec, p.target, p.hrZone, p.targetRate, p.notes])
  const groups: { count: number; piece: PieceTemplate; first: number }[] = []
  pieces.forEach((p, i) => {
    const last = groups.at(-1)
    if (last && key(last.piece) === key(p)) last.count++
    else groups.push({ count: 1, piece: p, first: i })
  })
  return groups
}

export function pieceLength(p: Pick<PieceTemplate, 'distanceM' | 'durationSec'>, sport: Sport, units: Units) {
  const unit = pieceUnit(sport, units)
  if (p.distanceM) return `${formatDistance(p.distanceM, unit)}${unit}`
  if (p.durationSec) return formatPlanTime(p.durationSec)
  return 'rep'
}

/** "8 × 500m · 2′ rest" */
export function describeGroup(g: { count: number; piece: PieceTemplate }, sport: Sport, units: Units) {
  return [`${g.count > 1 ? `${g.count} × ` : ''}${pieceLength(g.piece, sport, units)}`, g.piece.restSec ? `${formatPlanTime(g.piece.restSec)} rest` : '']
    .filter(Boolean)
    .join(' · ')
}

/** One line for library cards. */
export function structureSummary(w: Workout, units: Units): string {
  if (w.pieces?.length) {
    const groups = groupPieces(w.pieces)
    const shape = groups.map((g) => `${g.count > 1 ? `${g.count}×` : ''}${pieceLength(g.piece, w.sport, units)}`).join(' + ')
    const aim = groups.length === 1 ? describeAim(groups[0].piece, w.sport, units) : ''
    return [shape, aim].filter(Boolean).join(' · ')
  }
  if (w.exercises?.length) {
    const names = w.exercises.map((e) => e.name).filter(Boolean)
    return [names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : ''), w.wod && 'WOD'].filter(Boolean).join(' · ')
  }
  if (w.wod) return [WOD_FORMATS.find((f) => f.value === w.wod!.format)?.label, w.wod.timeCapSec && formatPlanTime(w.wod.timeCapSec)].filter(Boolean).join(' · ')
  const unit = distanceUnit(w.sport, units)
  return [w.durationSec && formatPlanTime(w.durationSec), w.distanceM && `${formatDistance(w.distanceM, unit)}${unit}`, describeAim(w, w.sport, units)]
    .filter(Boolean)
    .join(' · ')
}

/** Planned work and rest where the reps make it knowable. */
export function plannedTotals(w: Workout) {
  const pieces = w.pieces ?? []
  if (!pieces.length) return { workSec: w.durationSec, distM: w.distanceM, restSec: undefined }
  const distM = pieces.every((p) => p.distanceM) ? pieces.reduce((a, p) => a + p.distanceM!, 0) : undefined
  const workSec = pieces.every((p) => p.durationSec && !p.distanceM) ? pieces.reduce((a, p) => a + p.durationSec!, 0) : undefined
  const restSec = pieces.slice(0, -1).reduce((a, p) => a + (p.restSec ?? 0), 0) || undefined
  return { workSec, distM, restSec }
}

export function allTags(workouts: Workout[]) {
  return [...new Set(workouts.flatMap((w) => w.tags))].sort((a, b) => a.localeCompare(b))
}
