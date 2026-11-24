import { EMPTY_PROFILE, type AthleteProfile } from './types'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

/**
 * A saved profile laid over the empty one, keeping the shapes the screening relies on
 * (lists stay lists, sections stay objects) so one bad field can't break the page.
 */
export function parseProfile(saved: unknown): AthleteProfile | undefined {
  if (!isObj(saved)) return undefined
  const goal = isObj(saved.goal) ? saved.goal : {}
  const injuries = list<Obj>(saved.injuries)
    .filter(isObj)
    .map((i) => ({ ...i, aggravatedBy: list(i.aggravatedBy) }))
  return {
    ...EMPTY_PROFILE,
    ...saved,
    goal: { ...goal, legs: list<Obj>(goal.legs).filter(isObj) },
    health: isObj(saved.health) ? saved.health : {},
    injuries,
    availability: isObj(saved.availability) ? saved.availability : {},
    equipment: list(saved.equipment),
    keep: list<Obj>(saved.keep).filter(isObj),
  } as unknown as AthleteProfile
}
