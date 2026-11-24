// Turning accepted review proposals into changes to the block and its planned sessions.
// The caller saves them and re-plans the unlocked weeks ahead.

import type { Block, PlannedSession, ReviewProposal, WeekAdjust } from '../plan/types'

const union = <T>(a: T[] | undefined, b: T[] | undefined) => {
  const all = [...new Set([...(a ?? []), ...(b ?? [])])]
  return all.length ? all : undefined
}

/** Two changes to the same week: the smaller volume, and every restriction from both. */
export function combine(a: WeekAdjust | undefined, b: WeekAdjust): WeekAdjust {
  if (!a) return b
  const scale = a.scale != null && b.scale != null ? Math.min(a.scale, b.scale) : (a.scale ?? b.scale)
  return { scale, easyOnly: a.easyOnly || b.easyOnly || undefined, less: union(a.less, b.less), drop: union(a.drop, b.drop) }
}

export interface Applied {
  block?: Block
  /** Planned sessions changed (each locked, so re-planning leaves it alone). */
  sessions: PlannedSession[]
}

export function applyProposals(accepted: ReviewProposal[], block: Block | undefined, planned: PlannedSession[]): Applied {
  let b = block
  const sessions = new Map<string, PlannedSession>()
  for (const p of accepted) {
    const c = p.change
    if (!c) continue
    if (c.kind === 'adjustWeek' && b) {
      b = { ...b, weekAdjust: { ...b.weekAdjust, [c.week]: combine(b.weekAdjust?.[c.week], c.adjust) } }
    } else if (c.kind === 'weekKind' && b) {
      b = { ...b, weekKinds: { ...b.weekKinds, [c.week]: c.to } }
    } else if (c.kind === 'moveSession') {
      const from = planned.find((x) => x.id === c.fromId)
      const to = sessions.get(c.toId) ?? planned.find((x) => x.id === c.toId)
      if (!from || !to) continue
      sessions.set(to.id, {
        ...to,
        title: from.title,
        workoutId: from.workoutId,
        oneOff: from.oneOff,
        benchmark: from.benchmark,
        durationSec: from.durationSec ?? to.durationSec,
        notes: [to.notes, `Moved from ${from.date}, when it was missed.`].filter(Boolean).join(' '),
        locked: true,
      })
    }
  }
  return { block: b, sessions: [...sessions.values()] }
}
