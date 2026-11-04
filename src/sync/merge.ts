// Three-way merge of two copies of a store that both started from the same copy (`base`,
// what was last synced). Changes made on either side survive, as long as they don't touch
// the same field of the same item:
//  - objects merge key by key;
//  - lists of records (sessions, workouts, planned sessions, check-ins…) merge record by
//    record, matched by `id` (or `date` for check-ins, `exercise` for 1RMs): added on
//    either side → kept; deleted on one side and untouched on the other → deleted; edited
//    on one side and deleted on the other → the edit wins, so nothing typed is lost;
//  - lists of plain values (tags, ids already imported) merge as sets;
//  - anything else changed on both sides goes to the side with the later `updatedAt`
//    on the nearest record, or `prefer` when there's no way to tell.
// With no base (a device joining an account that already has data), both copies are
// combined: records from both are kept, and `prefer` settles any field they disagree on.

export type Side = 'local' | 'remote'

type Json = unknown
type Obj = Record<string, unknown>

const isObj = (v: Json): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

export function equal(a: Json, b: Json): boolean {
  if (a === b) return true
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => equal(x, b[i]))
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined)
    const kb = Object.keys(b).filter((k) => b[k] !== undefined)
    return ka.length === kb.length && ka.every((k) => equal(a[k], b[k]))
  }
  return false
}

const ID_FIELDS = ['id', 'date', 'exercise'] as const

/** The field that identifies records in a list, if every record has a distinct one. */
function idField(...lists: Json[][]): string | undefined {
  const all = lists.flat()
  if (!all.length || !all.every(isObj)) return undefined
  for (const f of ID_FIELDS) {
    if (!all.every((x) => typeof (x as Obj)[f] === 'string')) continue
    // Each list must have no repeats, or records would be merged into each other.
    if (lists.every((l) => new Set(l.map((x) => (x as Obj)[f])).size === l.length)) return f
  }
  return undefined
}

const isPrimitiveList = (l: Json[]) => l.every((x) => x === null || ['string', 'number', 'boolean'].includes(typeof x))

/** Later `updatedAt` wins; otherwise the default. */
function newer(a: Json, b: Json, prefer: Side): Side {
  const ta = isObj(a) && typeof a.updatedAt === 'string' ? a.updatedAt : undefined
  const tb = isObj(b) && typeof b.updatedAt === 'string' ? b.updatedAt : undefined
  if (ta && tb && ta !== tb) return ta > tb ? 'local' : 'remote'
  return prefer
}

function mergeRecords(base: Json[] | undefined, a: Json[], b: Json[], field: string, prefer: Side): Json[] {
  const key = (x: Json) => (x as Obj)[field] as string
  const baseBy = new Map((base ?? []).map((x) => [key(x), x]))
  const bBy = new Map(b.map((x) => [key(x), x]))
  const aIds = new Set(a.map(key))
  const out: Json[] = []
  const take = (id: string, av: Json | undefined, bv: Json | undefined) => {
    const was = baseBy.get(id)
    if (av !== undefined && bv !== undefined) return out.push(merge(was, av, bv, newer(av, bv, prefer)))
    const only = av ?? bv
    if (!base || was === undefined) return out.push(only) // added on one side
    // Gone on the other side: deleted there. Keep it only if this side changed it since.
    if (!equal(was, only)) out.push(only)
  }
  for (const av of a) take(key(av), av, bBy.get(key(av)))
  for (const bv of b) if (!aIds.has(key(bv))) take(key(bv), undefined, bv)
  return out
}

function mergeSet(base: Json[] | undefined, a: Json[], b: Json[]): Json[] {
  const had = new Set(base ?? [])
  const inA = new Set(a)
  const inB = new Set(b)
  const out: Json[] = []
  for (const v of [...a, ...b]) {
    if (out.includes(v)) continue
    // Was there before and one side removed it: removed.
    if (base && had.has(v) && (!inA.has(v) || !inB.has(v))) continue
    out.push(v)
  }
  return out
}

export function merge(base: Json, a: Json, b: Json, prefer: Side): Json {
  if (equal(a, b)) return a
  if (base !== undefined) {
    if (equal(base, a)) return b
    if (equal(base, b)) return a
  }
  if (isObj(a) && isObj(b)) {
    const side = newer(a, b, prefer)
    const out: Obj = {}
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const v = merge(isObj(base) ? base[k] : undefined, a[k], b[k], side)
      if (v !== undefined) out[k] = v
    }
    return out
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const baseList = Array.isArray(base) ? base : undefined
    const field = idField(a, b, baseList ?? [])
    if (field) return mergeRecords(baseList, a, b, field, prefer)
    if (isPrimitiveList(a) && isPrimitiveList(b)) return mergeSet(baseList, a, b)
  }
  // A real clash on a single value (or one side removed a field the other changed).
  if (a === undefined) return base === undefined ? b : equal(base, b) ? undefined : b
  if (b === undefined) return base === undefined ? a : equal(base, a) ? undefined : a
  return prefer === 'local' ? a : b
}

/** Merges two copies of a whole store. */
export const mergeStores = (base: Obj | undefined, local: Obj, remote: Obj, prefer: Side = base ? 'local' : 'remote') =>
  merge(base, local, remote, prefer) as Obj
