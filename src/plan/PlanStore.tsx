import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { newId } from '../log/format'
import { DEFAULT_PREFS, byDate, mergeImported } from './data'
import type { Block, Commitment, PlanEvent, PlanPrefs, PlannedSession } from './types'

interface PlanData {
  blocks: Block[]
  planned: PlannedSession[]
  events: PlanEvent[]
  commitments: Commitment[]
  prefs: PlanPrefs
}

const EMPTY: PlanData = { blocks: [], planned: [], events: [], commitments: [], prefs: DEFAULT_PREFS }
const STORAGE_KEY = 'tt-plan-v1'

// Plan data lives in localStorage next to the log until the Supabase section;
// this file is the only one that touches it.
function load(): PlanData {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return { ...EMPTY, ...saved, prefs: { ...DEFAULT_PREFS, ...saved.prefs } }
  } catch {
    return EMPTY
  }
}

export type BlockDraft = Omit<Block, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string }
export type PlannedDraft = Omit<PlannedSession, 'id'> & { id?: string }

interface PlanValue extends PlanData {
  saveBlock: (draft: BlockDraft) => Block
  /** Removes the block and the sessions it planned that haven't been logged. */
  deleteBlock: (id: string, keep: (p: PlannedSession) => boolean) => void
  savePlanned: (draft: PlannedDraft) => PlannedSession
  deletePlanned: (id: string) => void
  /** Swaps a block's re-plannable sessions from `from` onwards for fresh ones. */
  replacePlanned: (blockId: string, from: string, keep: (p: PlannedSession) => boolean, fresh: PlannedSession[]) => void
  saveEvent: (draft: Omit<PlanEvent, 'id'> & { id?: string }) => PlanEvent
  deleteEvent: (id: string) => void
  addCommitments: (list: Omit<Commitment, 'id'>[]) => void
  updateCommitment: (id: string, patch: Partial<Commitment>) => void
  deleteCommitment: (id: string) => void
  /** Replaces imported commitments from one source within a date range (a re-sync), keeping work/demand set by hand. */
  replaceImported: (source: Commitment['source'], from: string, to: string, list: Omit<Commitment, 'id'>[]) => void
  updatePrefs: (patch: Partial<PlanPrefs>) => void
}

const PlanContext = createContext<PlanValue | null>(null)

const stamp = () => new Date().toISOString()

function upsert<T>(list: T[], item: T, same: (a: T) => boolean) {
  return list.some(same) ? list.map((x) => (same(x) ? item : x)) : [...list, item]
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PlanData>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // Storage unavailable or full; the plan still works for this visit.
    }
  }, [data])

  const value: PlanValue = {
    ...data,

    saveBlock(draft) {
      const now = stamp()
      const block: Block = { ...draft, id: draft.id ?? newId(), createdAt: draft.createdAt ?? now, updatedAt: now }
      setData((d) => ({ ...d, blocks: upsert(d.blocks, block, (b) => b.id === block.id).sort((a, b) => a.start.localeCompare(b.start)) }))
      return block
    },

    deleteBlock(id, keep) {
      setData((d) => ({
        ...d,
        blocks: d.blocks.filter((b) => b.id !== id),
        planned: d.planned.filter((p) => p.blockId !== id || keep(p)).map((p) => (p.blockId === id ? { ...p, blockId: undefined } : p)),
      }))
    },

    savePlanned(draft) {
      const item: PlannedSession = { ...draft, id: draft.id ?? newId() }
      setData((d) => ({ ...d, planned: upsert(d.planned, item, (p) => p.id === item.id).sort(byDate) }))
      return item
    },

    deletePlanned(id) {
      setData((d) => ({ ...d, planned: d.planned.filter((p) => p.id !== id) }))
    },

    replacePlanned(blockId, from, keep, fresh) {
      setData((d) => ({
        ...d,
        planned: [...d.planned.filter((p) => p.blockId !== blockId || p.date < from || keep(p)), ...fresh].sort(byDate),
      }))
    },

    saveEvent(draft) {
      const event: PlanEvent = { ...draft, id: draft.id ?? newId() }
      setData((d) => ({ ...d, events: upsert(d.events, event, (e) => e.id === event.id).sort(byDate) }))
      return event
    },

    deleteEvent(id) {
      setData((d) => ({
        ...d,
        events: d.events.filter((e) => e.id !== id),
        planned: d.planned.map((p) => (p.eventId === id ? { ...p, eventId: undefined } : p)),
      }))
    },

    addCommitments(list) {
      setData((d) => ({ ...d, commitments: [...d.commitments, ...list.map((c) => ({ ...c, id: newId() }))].sort(byDate) }))
    },

    updateCommitment(id, patch) {
      setData((d) => ({ ...d, commitments: d.commitments.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
    },

    deleteCommitment(id) {
      setData((d) => ({ ...d, commitments: d.commitments.filter((c) => c.id !== id) }))
    },

    replaceImported(source, from, to, list) {
      setData((d) => ({ ...d, commitments: mergeImported(d.commitments, source, from, to, list) }))
    },

    updatePrefs(patch) {
      setData((d) => ({ ...d, prefs: { ...d.prefs, ...patch } }))
    },
  }

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}

export function usePlan() {
  const ctx = useContext(PlanContext)
  if (!ctx) throw new Error('usePlan must be used inside PlanProvider')
  return ctx
}
