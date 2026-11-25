import { ArrowDown, ArrowUp, Copy, Plus, Trash2, X } from 'lucide-react'
import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Chips, Field, NumberInput, Scale, Section, TextArea, TextInput, TimeInput, inputClass } from '../../components/fields'
import { AimFields, AimToggle } from '../../components/targets'
import { PageHeader, Segmented } from '../../components/ui'
import { allTags, blankWorkout, describeGroup, groupPieces, pieceUnit, roundToPlates, workoutFromEvent, workoutFromSession } from '../../library/workouts'
import { distanceFactor, distanceUnit, formatWeight, newId, weightFactor, weightUnit } from '../../log/format'
import { useLog, type WorkoutDraft } from '../../log/LogStore'
import { LEG_SPORTS, MAIN_LIFTS, MULTISPORT_KINDS, RPE_LABELS, SPORTS, WOD_FORMATS } from '../../log/sports'
import { findMax } from '../../log/stats'
import type { ExerciseTemplate, MultisportKind, PieceTemplate, SetTemplate, Sport, WorkoutLeg } from '../../log/types'
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
          <AimToggle sport={sport} value={s.piece} onChange={(a) => updatePiece(i, { target: a.target, rel: a.rel, hrZone: a.hrZone, targetRate: a.targetRate })} />
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

// ---- Brick legs ------------------------------------------------------------------------

const blankLeg = (sport: Sport): WorkoutLeg => ({ id: newId(), sport })

/** The sports a leg can be: the multisport ones, without transitions (those are worked out when logging). */
const BRICK_SPORTS = LEG_SPORTS.filter((s) => s !== 'transition')

function BrickEditor({ kind, legs, onChange }: { kind: MultisportKind; legs: WorkoutLeg[]; onChange: (kind: MultisportKind, legs: WorkoutLeg[]) => void }) {
  const { settings } = useSettings()
  const setLeg = (i: number, p: Partial<WorkoutLeg>) => onChange(kind, legs.map((l, j) => (j === i ? { ...l, ...p } : l)))
  const move = (i: number, by: number) => {
    const next = [...legs]
    const [x] = next.splice(i, 1)
    next.splice(i + by, 0, x)
    onChange(kind, next)
  }
  const pickKind = (k: MultisportKind | undefined) => {
    if (!k) return
    // Switching kind swaps the legs for that kind's usual ones only while nothing has been filled in.
    const untouched = legs.every((l) => !l.durationSec && !l.distanceM && !l.pieces?.length && !l.target && !l.rel && !l.hrZone && !l.notes)
    onChange(k, untouched ? MULTISPORT_KINDS.find((x) => x.value === k)!.legs.map(blankLeg) : legs)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-medium text-muted">What kind of session is it?</p>
        <Chips value={kind} allowNone={false} options={MULTISPORT_KINDS} onChange={pickKind} />
      </div>
      {legs.map((leg, i) => {
        const def = SPORTS[leg.sport]
        const unit = distanceUnit(leg.sport, settings.units)
        return (
          <section key={leg.id} className="rounded-2xl border border-line bg-surface">
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <span className={`grid size-8 place-items-center rounded-lg ${def.soft} ${def.text}`}>
                <def.icon className="size-4" />
              </span>
              <select
                aria-label="Leg sport"
                className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
                value={leg.sport}
                onChange={(e) => setLeg(i, { sport: e.target.value as Sport, type: undefined, pieces: undefined, target: undefined, rel: undefined, hrZone: undefined, targetRate: undefined, distanceM: undefined })}
              >
                {BRICK_SPORTS.map((s) => (
                  <option key={s} value={s}>
                    Leg {i + 1} · {SPORTS[s].label}
                  </option>
                ))}
              </select>
              <span className="flex">
                {[
                  { label: 'Move leg up', icon: ArrowUp, onClick: () => move(i, -1), hidden: i === 0 },
                  { label: 'Move leg down', icon: ArrowDown, onClick: () => move(i, 1), hidden: i === legs.length - 1 },
                  { label: 'Remove leg', icon: Trash2, onClick: () => onChange(kind, legs.filter((_, j) => j !== i)) },
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
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Duration">
                  <TimeInput value={leg.durationSec} placeholder="h:mm:ss" onChange={(durationSec) => setLeg(i, { durationSec })} />
                </Field>
                <Field label="Distance" unit={unit}>
                  <NumberInput value={leg.distanceM} factor={distanceFactor(unit)} decimals={unit === 'm' ? 0 : 2} placeholder="—" onChange={(distanceM) => setLeg(i, { distanceM })} />
                </Field>
              </div>
              {leg.sport !== 'other' && (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted">Target for the whole leg. Reps below have their own.</p>
                  <AimFields key={leg.sport} sport={leg.sport} value={leg} onChange={(a) => setLeg(i, { target: a.target, rel: a.rel, hrZone: a.hrZone, targetRate: a.targetRate })} />
                </div>
              )}
              {SPORTS[leg.sport].pieces && (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted">Reps in this leg (optional)</p>
                  <RepSetsEditor key={`${leg.id}-${leg.sport}`} sport={leg.sport} initial={leg.pieces} onChange={(pieces) => setLeg(i, { pieces })} />
                </div>
              )}
              <input className={inputClass} placeholder="Notes for this leg, e.g. straight off the bike, 180° turn" value={leg.notes ?? ''} onChange={(e) => setLeg(i, { notes: e.target.value || undefined })} />
            </div>
          </section>
        )
      })}
      <div className="flex flex-wrap items-center gap-2">
        {BRICK_SPORTS.filter((s) => s !== 'row' && s !== 'erg').map((s) => (
          <button key={s} type="button" onClick={() => onChange(kind, [...legs, blankLeg(s)])} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2">
            <Plus className="size-4" /> Add {SPORTS[s].label.toLowerCase()} leg
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">Transitions between legs are worked out from start and finish times when you log it, so they aren’t part of the plan.</p>
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
  const brick = !!draft.legs
  const noLegs = brick && !draft.legs!.length

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const name = draft.name.trim() || 'Untitled workout'
    // A brick keeps only what belongs to it: legs, name, tags, RPE and notes. Its sport is the first leg's.
    const saved = saveWorkout(
      brick
        ? {
            ...draft,
            name,
            sport: draft.legs![0]?.sport ?? 'other',
            type: undefined,
            durationSec: undefined,
            distanceM: undefined,
            target: undefined,
            rel: undefined,
            hrZone: undefined,
            targetRate: undefined,
            pieces: undefined,
            exercises: undefined,
            wod: undefined,
          }
        : { ...draft, name, legs: undefined, brickKind: undefined },
    )
    navigate(`/library/${saved.id}`, { replace: true })
  }

  return (
    <form onSubmit={submit} className="space-y-5 pb-24">
      <Segmented
        value={brick ? 'brick' : 'single'}
        options={[
          { value: 'single', label: 'One sport' },
          { value: 'brick', label: 'Brick / multisport' },
        ]}
        onChange={(v) => (v === 'brick' ? !brick && patch({ legs: MULTISPORT_KINDS[3].legs.map(blankLeg), brickKind: 'brick' }) : patch({ legs: undefined, brickKind: undefined }))}
      />

      {!brick && <SportPicker value={draft.sport} multisport={false} onPick={(sport) => patch({ sport, type: undefined })} />}

      {!brick && def.types.length > 0 && <Chips value={draft.type} options={def.types} onChange={(type) => patch({ type, ...((type === 'wod' || type === 'mixed') && !draft.wod ? { wod: { format: 'amrap' } } : {}) })} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      {brick && (
        <>
          <Section title="Legs" defaultOpen summary={`${draft.legs!.length} leg${draft.legs!.length === 1 ? '' : 's'}`}>
            <BrickEditor kind={draft.brickKind ?? 'brick'} legs={draft.legs!} onChange={(brickKind, legs) => patch({ brickKind, legs })} />
          </Section>
          <Section title="Effort" summary="Target RPE" defaultOpen={!!draft.rpe}>
            <Field label="Target RPE">
              <Scale value={draft.rpe} onChange={(rpe) => patch({ rpe })} low="Very easy" high="Max" describe={(v) => RPE_LABELS[v]} />
            </Field>
          </Section>
        </>
      )}

      {!brick && <Section title="Session plan" summary="Duration, distance, target, RPE" defaultOpen={!def.pieces || !!(draft.durationSec || draft.distanceM || draft.target || draft.hrZone)}>
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
              <AimFields sport={draft.sport} value={draft} onChange={(a) => patch({ target: a.target, rel: a.rel, hrZone: a.hrZone, targetRate: a.targetRate })} />
            </div>
          )}
          <Field label="Target RPE">
            <Scale value={draft.rpe} onChange={(rpe) => patch({ rpe })} low="Very easy" high="Max" describe={(v) => RPE_LABELS[v]} />
          </Field>
        </div>
      </Section>}

      {!brick && def.pieces && (
        <Section title="Reps" defaultOpen summary={draft.pieces?.length ? `${draft.pieces.length} reps` : 'Intervals and pieces'}>
          <RepSetsEditor key={draft.sport} sport={draft.sport} initial={draft.pieces} onChange={(pieces) => patch({ pieces })} />
        </Section>
      )}

      {!brick && strength && draft.type !== 'wod' && (
        <Section title="Exercises" defaultOpen summary={draft.exercises?.length ? `${draft.exercises.length} exercises` : undefined}>
          <StrengthTemplateEditor exercises={draft.exercises ?? []} onChange={(exercises) => patch({ exercises })} />
        </Section>
      )}

      {!brick && strength &&
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

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-64">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-2 md:px-4">
          <button type="button" onClick={() => navigate(-1)} className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">
            Cancel
          </button>
          <button type="submit" disabled={noLegs} className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90 disabled:opacity-40">
            {editing ? 'Save changes' : 'Save to library'}
          </button>
        </div>
      </div>
    </form>
  )
}

export function NewWorkout() {
  const [params] = useSearchParams()
  const { sessions, multisport } = useLog()
  const from = sessions.find((s) => s.id === params.get('from'))
  const event = multisport.find((m) => m.id === params.get('fromEvent'))
  const eventLegs = event ? event.legIds.map((id) => sessions.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s) : []
  const initial = event ? workoutFromEvent(event, eventLegs) : from ? workoutFromSession(from) : blankWorkout()
  return (
    <>
      <PageHeader title="New workout" subtitle={from || event ? 'Saved from a logged session: its structure and targets, not its results.' : 'A reusable session for the library'} />
      <Form key={params.toString()} initial={initial} editing={false} />
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
