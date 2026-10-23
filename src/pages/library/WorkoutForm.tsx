import { ArrowDown, ArrowUp, Copy, Plus, Trash2, X } from 'lucide-react'
import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Chips, Field, NumberInput, Scale, Section, TextArea, TextInput, TimeInput, inputClass } from '../../components/fields'
import { AimFields, AimToggle } from '../../components/targets'
import { PageHeader } from '../../components/ui'
import { allTags, blankWorkout, describeGroup, groupPieces, pieceUnit, roundToPlates, workoutFromSession } from '../../library/workouts'
import { distanceFactor, distanceUnit, formatWeight, newId, weightFactor, weightUnit } from '../../log/format'
import { useLog, type WorkoutDraft } from '../../log/LogStore'
import { MAIN_LIFTS, RPE_LABELS, SPORTS, WOD_FORMATS } from '../../log/sports'
import { findMax } from '../../log/stats'
import type { ExerciseTemplate, PieceTemplate, SetTemplate, Sport } from '../../log/types'
import { useSettings } from '../../settings/SettingsContext'
import { SportPicker } from '../log/SessionForm'

type Patch = (p: Partial<WorkoutDraft>) => void

// ---- Tags -----------------------------------------------------------------------

function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { workouts } = useLog()
  const [text, setText] = useState('')
  const add = (raw: string) => {
    const tag = raw.trim().replace(/^#/, '').toLowerCase()
    if (tag && !value.includes(tag)) onChange([...value, tag])
    setText('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(text)
    } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
  }
  const suggestions = allTags(workouts).filter((t) => !value.includes(t))
  return (
    <div>
      <div className={`${inputClass} flex flex-wrap items-center gap-1.5 !py-1.5`}>
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pl-2.5 pr-1 text-sm font-medium text-accent-strong">
            #{t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="grid size-5 place-items-center rounded-full hover:bg-accent/20">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          className="min-w-24 flex-1 bg-transparent py-1 outline-none placeholder:text-muted/60"
          list="workout-tags"
          placeholder={value.length ? '' : 'e.g. ut2, threshold, test, gym'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => text && add(text)}
        />
      </div>
      <datalist id="workout-tags">
        {suggestions.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  )
}

// ---- Reps, edited as sets of identical reps ----------------------------------------

interface RepSet {
  key: string
  count?: number
  piece: PieceTemplate
}

const toSets = (pieces: PieceTemplate[] = []): RepSet[] => groupPieces(pieces).map((g) => ({ key: newId(), count: g.count, piece: g.piece }))
const toPieces = (sets: RepSet[]): PieceTemplate[] => sets.flatMap((s) => Array.from({ length: s.count ?? 0 }, () => ({ ...s.piece, id: newId() })))

function RepSetsEditor({ sport, initial, onChange }: { sport: Sport; initial?: PieceTemplate[]; onChange: (p: PieceTemplate[] | undefined) => void }) {
  const { settings } = useSettings()
  const [sets, setSets] = useState<RepSet[]>(() => toSets(initial))
  const unit = pieceUnit(sport, settings.units)

  const commit = (next: RepSet[]) => {
    setSets(next)
    const pieces = toPieces(next)
    onChange(pieces.length ? pieces : undefined)
  }
  const update = (i: number, p: Partial<RepSet>) => commit(sets.map((s, j) => (j === i ? { ...s, ...p } : s)))
  const updatePiece = (i: number, p: Partial<PieceTemplate>) => update(i, { piece: { ...sets[i].piece, ...p } })
  const move = (i: number, by: number) => {
    const next = [...sets]
    const [x] = next.splice(i, 1)
    next.splice(i + by, 0, x)
    commit(next)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Each row is a set of identical reps, e.g. 8 × 500m with 2′ rest. Add rows for pyramids or mixed sessions. Give a rep a distance <em>or</em> a time:
        the other one is what you log.
      </p>
      {sets.map((s, i) => (
        <div key={s.key} className="rounded-xl border border-line p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="tabular text-sm font-semibold">{s.count ? describeGroup({ count: s.count, piece: s.piece }, sport, settings.units) : `Set ${i + 1}`}</span>
            <span className="flex">
              {[
                { label: 'Move up', icon: ArrowUp, onClick: () => move(i, -1), hidden: i === 0 },
                { label: 'Move down', icon: ArrowDown, onClick: () => move(i, 1), hidden: i === sets.length - 1 },
                { label: 'Duplicate set', icon: Copy, onClick: () => commit([...sets.slice(0, i + 1), { ...s, key: newId() }, ...sets.slice(i + 1)]) },
                { label: 'Remove set', icon: Trash2, onClick: () => commit(sets.filter((_, j) => j !== i)) },
              ].map(
                ({ label, icon: Icon, onClick, hidden }) =>
                  !hidden && (
                    <button key={label} type="button" aria-label={label} onClick={onClick} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text">
                      <Icon className="size-4" />
                    </button>
                  ),
              )}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Reps">
              <NumberInput integer value={s.count} placeholder="1" onChange={(count) => update(i, { count })} />
            </Field>
            <Field label="Distance" unit={unit}>
              <NumberInput
                value={s.piece.distanceM}
                factor={distanceFactor(unit)}
                decimals={unit === 'm' ? 0 : 2}
                placeholder="—"
                onChange={(distanceM) => updatePiece(i, { distanceM, durationSec: distanceM ? undefined : s.piece.durationSec })}
              />
            </Field>
            <Field label="or time">
              <TimeInput value={s.piece.durationSec} placeholder="m:ss" onChange={(durationSec) => updatePiece(i, { durationSec, distanceM: durationSec ? undefined : s.piece.distanceM })} />
            </Field>
            <Field label="Rest after each">
              <TimeInput value={s.piece.restSec} bare="sec" placeholder="m:ss" onChange={(restSec) => updatePiece(i, { restSec })} />
            </Field>
          </div>
          <input className={`${inputClass} mt-2`} placeholder="Notes, e.g. build each 500m, last one all out" value={s.piece.notes ?? ''} onChange={(e) => updatePiece(i, { notes: e.target.value || undefined })} />
          <AimToggle sport={sport} value={s.piece} onChange={(a) => updatePiece(i, { target: a.target, hrZone: a.hrZone, targetRate: a.targetRate })} />
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const last = sets.at(-1)
          commit([...sets, { key: newId(), count: last ? last.count : 4, piece: last ? { ...last.piece, id: newId() } : { id: newId() } }])
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2"
      >
        <Plus className="size-4" /> Add set of reps
      </button>
    </div>
  )
}

// ---- Strength template --------------------------------------------------------------

function ExerciseTemplateEditor({ e, onChange, onRemove }: { e: ExerciseTemplate; onChange: (e: ExerciseTemplate) => void; onRemove: () => void }) {
  const { settings } = useSettings()
  const { maxes } = useLog()
  const oneRm = findMax(maxes, e.name)?.kg
  const wf = weightFactor(settings.units)
  const wu = weightUnit(settings.units)
  const setSet = (i: number, p: Partial<SetTemplate>) => onChange({ ...e, sets: e.sets.map((s, j) => (j === i ? { ...s, ...p } : s)) })
  const cols = 'grid grid-cols-[1.75rem_1fr_1fr_1fr_0.9fr_1.75rem] items-center gap-1'

  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <input className={`${inputClass} font-semibold`} list="template-exercises" placeholder="Exercise, e.g. Back squat" value={e.name} onChange={(x) => onChange({ ...e, name: x.target.value })} />
          <p className="mt-1 text-xs text-muted">
            {oneRm
              ? `Your 1RM ${formatWeight(oneRm, settings.units)}${wu}. Plan by % and it works out the weight when you log.`
              : 'Plan by % of 1RM (weights fill in once you save a 1RM) or by fixed weight.'}
          </p>
        </div>
        <button type="button" aria-label="Remove exercise" onClick={onRemove} className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text">
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="mt-3 space-y-2">
        <div className={`${cols} px-0.5 text-xs font-medium text-muted`}>
          <span>Set</span>
          <span>Reps</span>
          <span>% 1RM</span>
          <span>or {wu}</span>
          <span>RPE</span>
          <span />
        </div>
        {e.sets.map((s, i) => (
          <div key={s.id} className={cols}>
            <button
              type="button"
              title={s.warmup ? 'Warm-up set (tap for working set)' : 'Working set (tap to mark as warm-up)'}
              onClick={() => setSet(i, { warmup: !s.warmup })}
              className={`tabular h-full rounded-lg text-sm font-semibold ${s.warmup ? 'bg-surface-2 text-muted' : 'bg-accent-soft text-accent-strong'}`}
            >
              {s.warmup ? 'W' : e.sets.slice(0, i + 1).filter((x) => !x.warmup).length}
            </button>
            <NumberInput aria-label="Reps" className="!px-1 text-center" integer value={s.reps} onChange={(reps) => setSet(i, { reps })} />
            <NumberInput
              aria-label="Percent of 1RM"
              className="!px-1 text-center"
              decimals={1}
              value={s.pct}
              placeholder={oneRm && s.weightKg ? String(Math.round((s.weightKg / oneRm) * 100)) : '%'}
              onChange={(pct) => setSet(i, { pct, weightKg: pct != null ? undefined : s.weightKg })}
            />
            <NumberInput
              aria-label="Weight"
              className="!px-1 text-center"
              factor={wf}
              decimals={1}
              value={s.weightKg}
              placeholder={s.pct != null && oneRm ? formatWeight(roundToPlates((s.pct / 100) * oneRm), settings.units) : '—'}
              onChange={(weightKg) => setSet(i, { weightKg, pct: weightKg != null ? undefined : s.pct })}
            />
            <NumberInput aria-label="Set RPE" className="!px-1 text-center" decimals={1} value={s.rpe} onChange={(rpe) => setSet(i, { rpe })} />
            <button type="button" aria-label="Remove set" onClick={() => onChange({ ...e, sets: e.sets.filter((_, j) => j !== i) })} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          const last = e.sets.at(-1)
          onChange({ ...e, sets: [...e.sets, { id: newId(), reps: last?.reps, pct: last?.pct, weightKg: last?.weightKg, rpe: last?.rpe }] })
        }}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2"
      >
        <Plus className="size-4" /> Add set
      </button>
      <input className={`${inputClass} mt-2`} placeholder="Notes (tempo, cues, progression)" value={e.notes ?? ''} onChange={(x) => onChange({ ...e, notes: x.target.value || undefined })} />
    </div>
  )
}

function StrengthTemplateEditor({ exercises, onChange }: { exercises: ExerciseTemplate[]; onChange: (e: ExerciseTemplate[] | undefined) => void }) {
  const { maxes } = useLog()
  const names = [...new Set([...MAIN_LIFTS, ...maxes.map((m) => m.exercise)])].sort()
  const set = (next: ExerciseTemplate[]) => onChange(next.length ? next : undefined)
  return (
    <div className="space-y-3">
      <datalist id="template-exercises">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {exercises.map((e, i) => (
        <ExerciseTemplateEditor key={e.id} e={e} onChange={(x) => set(exercises.map((y, j) => (j === i ? x : y)))} onRemove={() => set(exercises.filter((_, j) => j !== i))} />
      ))}
      <button
        type="button"
        onClick={() => set([...exercises, { id: newId(), name: '', sets: [{ id: newId() }] }])}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2"
      >
        <Plus className="size-4" /> Add exercise
      </button>
    </div>
  )
}

// ---- Whole form -----------------------------------------------------------------------

function Form({ initial, editing }: { initial: WorkoutDraft; editing: boolean }) {
  const { saveWorkout } = useLog()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(initial)
  const patch: Patch = (p) => setDraft((d) => ({ ...d, ...p }))
  const def = SPORTS[draft.sport]
  const unit = distanceUnit(draft.sport, settings.units)
  const strength = draft.sport === 'strength'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const saved = saveWorkout({ ...draft, name: draft.name.trim() || 'Untitled workout' })
    navigate(`/library/${saved.id}`, { replace: true })
  }

  return (
    <form onSubmit={submit} className="space-y-5 pb-24">
      <SportPicker value={draft.sport} multisport={false} onPick={(sport) => patch({ sport, type: undefined })} />

      {def.types.length > 0 && <Chips value={draft.type} options={def.types} onChange={(type) => patch({ type, ...((type === 'wod' || type === 'mixed') && !draft.wod ? { wod: { format: 'amrap' } } : {}) })} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <input className={`${inputClass} font-semibold`} required placeholder="e.g. 8 × 500m race pace" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <Field label="Tags" hint="Enter or comma to add. Used to filter the library.">
          <TagInput value={draft.tags} onChange={(tags) => patch({ tags })} />
        </Field>
        <Field label="Source" hint="Paper, coach, book or link, so you know where it came from.">
          <TextInput value={draft.source} onChange={(source) => patch({ source })} placeholder="e.g. Seiler 2010, or https://…" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <TextArea value={draft.description} onChange={(description) => patch({ description })} placeholder="What it's for, how it should feel, warm-up, progression" />
        </Field>
      </div>

      <Section title="Session plan" summary="Duration, distance, target, RPE" defaultOpen={!def.pieces || !!(draft.durationSec || draft.distanceM || draft.target || draft.hrZone)}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration">
              <TimeInput value={draft.durationSec} placeholder="h:mm:ss" onChange={(durationSec) => patch({ durationSec })} />
            </Field>
            {!strength && draft.sport !== 'recovery' && (
              <Field label="Distance" unit={unit}>
                <NumberInput value={draft.distanceM} factor={distanceFactor(unit)} decimals={unit === 'm' ? 0 : 2} placeholder="—" onChange={(distanceM) => patch({ distanceM })} />
              </Field>
            )}
          </div>
          {!strength && draft.sport !== 'recovery' && draft.sport !== 'other' && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted">Whole-session target, mainly for steady work (e.g. Z2 at r18). Reps have their own below.</p>
              <AimFields sport={draft.sport} value={draft} onChange={(a) => patch({ target: a.target, hrZone: a.hrZone, targetRate: a.targetRate })} />
            </div>
          )}
          <Field label="Target RPE">
            <Scale value={draft.rpe} onChange={(rpe) => patch({ rpe })} low="Very easy" high="Max" describe={(v) => RPE_LABELS[v]} />
          </Field>
        </div>
      </Section>

      {def.pieces && (
        <Section title="Reps" defaultOpen summary={draft.pieces?.length ? `${draft.pieces.length} reps` : 'Intervals and pieces'}>
          <RepSetsEditor key={draft.sport} sport={draft.sport} initial={draft.pieces} onChange={(pieces) => patch({ pieces })} />
        </Section>
      )}

      {strength && draft.type !== 'wod' && (
        <Section title="Exercises" defaultOpen summary={draft.exercises?.length ? `${draft.exercises.length} exercises` : undefined}>
          <StrengthTemplateEditor exercises={draft.exercises ?? []} onChange={(exercises) => patch({ exercises })} />
        </Section>
      )}

      {strength &&
        (draft.wod ? (
          <Section title="WOD" defaultOpen>
            <div className="space-y-3">
              <Chips value={draft.wod.format} allowNone={false} options={WOD_FORMATS} onChange={(format) => format && patch({ wod: { ...draft.wod!, format } })} />
              <TextArea value={draft.wod.description} onChange={(description) => patch({ wod: { ...draft.wod!, description } })} placeholder={'e.g. 21-15-9\nThrusters 43kg\nPull-ups'} rows={4} />
              <div className="flex flex-wrap items-end gap-4">
                <Field label={draft.wod.format === 'emom' ? 'Length' : 'Time cap'} className="w-36">
                  <TimeInput value={draft.wod.timeCapSec} onChange={(timeCapSec) => patch({ wod: { ...draft.wod!, timeCapSec } })} />
                </Field>
                <button type="button" onClick={() => patch({ wod: undefined })} className="pb-2.5 text-sm font-medium text-muted hover:text-text">
                  Remove WOD
                </button>
              </div>
            </div>
          </Section>
        ) : (
          <button
            type="button"
            onClick={() => patch({ wod: { format: 'amrap' } })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-2 text-sm font-semibold text-muted hover:text-text"
          >
            <Plus className="size-4" /> Add a WOD
          </button>
        ))}

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-2 md:px-4">
          <button type="button" onClick={() => navigate(-1)} className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">
            Cancel
          </button>
          <button type="submit" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90">
            {editing ? 'Save changes' : 'Save to library'}
          </button>
        </div>
      </div>
    </form>
  )
}

export function NewWorkout() {
  const [params] = useSearchParams()
  const { sessions } = useLog()
  const from = sessions.find((s) => s.id === params.get('from'))
  return (
    <>
      <PageHeader title="New workout" subtitle={from ? 'Saved from a logged session: its structure and targets, not its results.' : 'A reusable session for the library'} />
      <Form key={params.toString()} initial={from ? workoutFromSession(from) : blankWorkout()} editing={false} />
    </>
  )
}

export function EditWorkout() {
  const { id } = useParams()
  const { workouts } = useLog()
  const w = workouts.find((x) => x.id === id)
  if (!w) return <Navigate to="/library" replace />
  return (
    <>
      <PageHeader title="Edit workout" subtitle={w.name} />
      <Form initial={w} editing />
    </>
  )
}
