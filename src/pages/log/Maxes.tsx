import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Field, NumberInput, inputClass } from '../../components/fields'
import { Card, PageHeader } from '../../components/ui'
import { formatDate, formatWeight, todayIso, weightFactor, weightUnit } from '../../log/format'
import { useLog } from '../../log/LogStore'
import { MAIN_LIFTS } from '../../log/sports'
import { exerciseStats, findMax } from '../../log/stats'
import type { OneRepMax } from '../../log/types'
import { useSettings } from '../../settings/SettingsContext'

/** Best estimated 1RM per exercise across all logged sessions. */
function bestEstimates(sessions: ReturnType<typeof useLog>['sessions']) {
  const best = new Map<string, { name: string; kg: number; date: string }>()
  for (const s of sessions)
    for (const e of s.exercises ?? []) {
      const est = exerciseStats(e).e1rm
      const key = e.name.trim().toLowerCase()
      if (!est || !key) continue
      const cur = best.get(key)
      if (!cur || est > cur.kg) best.set(key, { name: e.name.trim(), kg: est, date: s.date })
    }
  return best
}

export default function Maxes() {
  const { maxes, sessions, saveMax, deleteMax } = useLog()
  const { settings } = useSettings()
  const wu = weightUnit(settings.units)
  const [draft, setDraft] = useState<Partial<OneRepMax>>({ date: todayIso() })
  const [editing, setEditing] = useState<string | undefined>()
  const estimates = bestEstimates(sessions)

  const save = () => {
    if (!draft.exercise?.trim() || !draft.kg) return
    saveMax({ exercise: draft.exercise.trim(), kg: draft.kg, date: draft.date ?? todayIso() }, editing)
    setDraft({ date: todayIso() })
    setEditing(undefined)
  }

  // Estimates from logged sets that beat (or have no) saved 1RM.
  const suggestions = [...estimates.values()].filter((e) => {
    const m = findMax(maxes, e.name)
    return !m || e.kg > m.kg
  })

  return (
    <div className="space-y-5">
      <Link to="/log" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Log
      </Link>
      <PageHeader title="1RMs" subtitle="Saved maxes for your main lifts, so sets can be logged as a % of 1RM." />

      <Card title={editing ? `Edit ${editing}` : 'Add or update a 1RM'}>
        <datalist id="max-lifts">
          {MAIN_LIFTS.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <Field label="Exercise" className="col-span-2 sm:col-span-1">
            <input className={inputClass} list="max-lifts" value={draft.exercise ?? ''} onChange={(e) => setDraft({ ...draft, exercise: e.target.value })} placeholder="Back squat" />
          </Field>
          <Field label="1RM" unit={wu}>
            <NumberInput value={draft.kg} factor={weightFactor(settings.units)} decimals={1} onChange={(kg) => setDraft({ ...draft, kg })} />
          </Field>
          <Field label="Date">
            <input type="date" className={inputClass} value={draft.date ?? ''} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          </Field>
          <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
            <button type="button" onClick={save} className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90 md:py-2">
              Save
            </button>
            {editing && (
              <button type="button" onClick={() => (setEditing(undefined), setDraft({ date: todayIso() }))} className="rounded-lg border border-line px-3 py-2.5 text-sm font-semibold md:py-2">
                Cancel
              </button>
            )}
          </div>
        </div>
      </Card>

      <Card title="Your 1RMs">
        {maxes.length ? (
          <ul className="divide-y divide-line">
            {maxes.map((m) => {
              const est = estimates.get(m.exercise.toLowerCase())
              return (
                <li key={m.exercise} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{m.exercise}</p>
                    <p className="text-xs text-muted">
                      Set {formatDate(m.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                      {est && ` · best estimate from logs ${formatWeight(est.kg, settings.units)}${wu}`}
                    </p>
                  </div>
                  <span className="tabular text-lg font-bold">
                    {formatWeight(m.kg, settings.units)}
                    <span className="ml-0.5 text-xs font-medium text-muted">{wu}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Edit ${m.exercise}`}
                    onClick={() => (setEditing(m.exercise), setDraft(m))}
                    className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${m.exercise}`}
                    onClick={() => confirm(`Delete the 1RM for ${m.exercise}?`) && deleteMax(m.exercise)}
                    className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">No 1RMs yet. Add your main lifts above.</p>
        )}
      </Card>

      {suggestions.length > 0 && (
        <Card title="From your logs">
          <p className="mb-3 text-sm text-muted">Estimated 1RMs (Epley, sets of 12 reps or fewer) that are higher than what’s saved.</p>
          <ul className="divide-y divide-line">
            {suggestions.map((e) => (
              <li key={e.name} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{e.name}</p>
                  <p className="text-xs text-muted">{formatDate(e.date, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <span className="tabular font-bold">
                  {formatWeight(e.kg, settings.units)}
                  {wu}
                </span>
                <button
                  type="button"
                  onClick={() => saveMax({ exercise: findMax(maxes, e.name)?.exercise ?? e.name, kg: e.kg, date: e.date })}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-surface-2"
                >
                  Use as 1RM
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
