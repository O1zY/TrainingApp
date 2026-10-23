import { Copy, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Chips, Field, MultiChips, NumberInput, ParsedInput, Scale, Section, TextArea, TextInput, TimeInput, Toggle, inputClass } from '../../components/fields'
import {
  PACE_LABEL,
  distanceFactor,
  distanceUnit,
  elevationFactor,
  elevationUnit,
  ergWatts,
  formatDistance,
  formatPace,
  formatTime,
  formatWeight,
  fromPace,
  isSpeed,
  newId,
  paceKind,
  paceValue,
  parseTime,
  weightFactor,
  weightUnit,
  type PaceKind,
} from '../../log/format'
import { AimToggle } from '../../components/targets'
import { useLog, type SessionDraft } from '../../log/LogStore'
import { findMax } from '../../log/stats'
import { FEEL_TAGS, MAIN_LIFTS, RPE_LABELS, SPORTS, WOD_FORMATS } from '../../log/sports'
import { exerciseStats, sessionLoad, summarisePieces } from '../../log/stats'
import type { Aim, ExerciseEntry, Piece, Sport, StrengthSet, Wod } from '../../log/types'
import { useSettings } from '../../settings/SettingsContext'

type Patch = (p: Partial<SessionDraft>) => void

// ---- Distance / time / pace triad -----------------------------------------

/** Enter any two of distance, time and pace; the third is worked out. Pace itself is never stored. */
function DistTimePace({
  kind,
  distUnit,
  distM,
  sec,
  onChange,
  timeLabel = 'Time',
}: {
  kind?: PaceKind
  distUnit: 'm' | 'km' | 'mi'
  distM?: number
  sec?: number
  onChange: (v: { distM?: number; sec?: number }) => void
  timeLabel?: string
}) {
  const factor = distanceFactor(distUnit)
  const pace = kind ? paceValue(kind, distM, sec) : undefined
  return (
    <>
      <Field label="Distance" unit={distUnit}>
        <NumberInput value={distM} factor={factor} decimals={distUnit === 'm' ? 0 : 2} placeholder="0" onChange={(d) => onChange({ distM: d, sec })} />
      </Field>
      <Field label={timeLabel}>
        <TimeInput value={sec} placeholder="h:mm:ss" onChange={(s) => onChange({ distM, sec: s })} />
      </Field>
      {kind && (
        <Field label={isSpeed(kind) ? 'Speed' : 'Pace'} unit={PACE_LABEL[kind]}>
          <ParsedInput<number>
            value={pace}
            inputMode={isSpeed(kind) ? 'decimal' : 'text'}
            placeholder={isSpeed(kind) ? '0.0' : 'm:ss'}
            format={(v) => formatPace(kind, v)}
            parse={(t) => {
              if (isSpeed(kind)) {
                const n = Number(t.replace(',', '.'))
                return t.trim() && n > 0 ? n : undefined
              }
              const v = parseTime(t, 'min')
              return v && v > 0 ? v : undefined
            }}
            onChange={(v) => {
              if (v != null && (distM || sec)) onChange(fromPace(kind, v, { distM, sec }))
            }}
          />
        </Field>
      )}
    </>
  )
}

// ---- Interval pieces ------------------------------------------------------

function PiecesEditor({ sport, pieces, onChange }: { sport: Sport; pieces: Piece[]; onChange: (p: Piece[]) => void }) {
  const { settings } = useSettings()
  const kind = paceKind(sport, settings.units)
  // Run reps are usually set in metres (400m, 1k); bike pieces follow the units setting.
  const unit = sport === 'bike' ? distanceUnit(sport, settings.units) : 'm'
  const rateLabel = sport === 'row' || sport === 'erg' ? 'Rate' : sport === 'swim' ? 'Strokes' : 'Cadence'
  const rateUnit = sport === 'row' || sport === 'erg' ? 'spm' : sport === 'bike' ? 'rpm' : sport === 'swim' ? '/len' : 'spm'
  const showWatts = sport === 'erg' || sport === 'bike'

  const [count, setCount] = useState<number | undefined>(4)
  const [targetDist, setTargetDist] = useState<number | undefined>()
  const [targetSec, setTargetSec] = useState<number | undefined>()
  const [rest, setRest] = useState<number | undefined>()
  const [aim, setAim] = useState<Aim>({})

  const set = (i: number, patch: Partial<Piece>) => onChange(pieces.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const summary = summarisePieces(pieces, sport, kind)

  const generate = () => {
    if (!count) return
    const made = Array.from({ length: count }, () => ({ id: newId(), distanceM: targetDist, durationSec: targetSec, restSec: rest, ...aim }))
    onChange([...pieces, ...made])
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-surface-2 p-3">
        <p className="mb-2 text-xs font-medium text-muted">Quick add a set, e.g. 4 × 2000m, rest 5:00. Then fill in each piece.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Field label="Reps">
            <NumberInput integer value={count} onChange={setCount} placeholder="4" />
          </Field>
          <Field label="Distance" unit={unit}>
            <NumberInput value={targetDist} factor={distanceFactor(unit)} decimals={unit === 'm' ? 0 : 2} onChange={setTargetDist} placeholder="—" />
          </Field>
          <Field label="or time">
            <TimeInput value={targetSec} onChange={setTargetSec} placeholder="m:ss" />
          </Field>
          <Field label="Rest">
            <TimeInput value={rest} bare="sec" onChange={setRest} placeholder="m:ss" />
          </Field>
          <div className="col-span-2 flex items-end sm:col-span-1">
            <button type="button" onClick={generate} className="w-full rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90 md:py-2">
              Add {count ?? ''} pieces
            </button>
          </div>
        </div>
        <AimToggle sport={sport} value={aim} onChange={setAim} label="Add a target for the set" />
      </div>

      {pieces.map((p, i) => {
        const pace = kind ? paceValue(kind, p.distanceM, p.durationSec) : undefined
        const derivedWatts = sport === 'erg' && !p.watts ? ergWatts(pace) : undefined
        return (
          <div key={p.id} className="rounded-xl border border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">
                Piece {i + 1}
                {summary.fastest === i && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-strong">Fastest</span>}
              </span>
              <span className="flex gap-1">
                <button
                  type="button"
                  aria-label="Duplicate piece"
                  onClick={() => onChange([...pieces.slice(0, i + 1), { ...p, id: newId() }, ...pieces.slice(i + 1)])}
                  className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
                >
                  <Copy className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Remove piece"
                  onClick={() => onChange(pieces.filter((_, j) => j !== i))}
                  className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
                >
                  <Trash2 className="size-4" />
                </button>
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              <DistTimePace kind={kind} distUnit={unit} distM={p.distanceM} sec={p.durationSec} onChange={(v) => set(i, { distanceM: v.distM, durationSec: v.sec })} />
              <Field label={rateLabel} unit={rateUnit}>
                <NumberInput integer value={p.rate} onChange={(rate) => set(i, { rate })} />
              </Field>
              {showWatts && (
                <Field label="Watts">
                  <NumberInput integer value={p.watts} onChange={(watts) => set(i, { watts })} placeholder={derivedWatts ? String(derivedWatts) : ''} />
                </Field>
              )}
              <Field label="HR avg">
                <NumberInput integer value={p.hrAvg} onChange={(hrAvg) => set(i, { hrAvg })} />
              </Field>
              <Field label="HR max">
                <NumberInput integer value={p.hrMax} onChange={(hrMax) => set(i, { hrMax })} />
              </Field>
              <Field label="Rest after">
                <TimeInput value={p.restSec} bare="sec" onChange={(restSec) => set(i, { restSec })} />
              </Field>
            </div>
            <input className={`${inputClass} mt-2`} placeholder="Notes for this piece" value={p.notes ?? ''} onChange={(e) => set(i, { notes: e.target.value || undefined })} />
            <AimToggle sport={sport} value={p} onChange={(a) => set(i, { target: a.target, hrZone: a.hrZone, targetRate: a.targetRate })} />
          </div>
        )
      })}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            const last = pieces.at(-1)
            const carry = last ? { distanceM: last.distanceM, restSec: last.restSec, target: last.target, hrZone: last.hrZone, targetRate: last.targetRate } : {}
            onChange([...pieces, { id: newId(), ...carry }])
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2"
        >
          <Plus className="size-4" /> Add piece
        </button>
        {pieces.length > 0 && (
          <p className="tabular text-sm text-muted">
            {summary.count} pieces · {formatDistance(summary.distM, unit)}
            {unit} · {formatTime(summary.sec)}
            {kind && summary.avgPace != null && ` · avg ${formatPace(kind, summary.avgPace)}${PACE_LABEL[kind]}`}
            {summary.avgWatts != null && ` · ${Math.round(summary.avgWatts)}W`}
          </p>
        )}
      </div>
    </div>
  )
}

// ---- Strength --------------------------------------------------------------

function ExerciseEditor({ entry, onChange, onRemove, suggestions }: { entry: ExerciseEntry; onChange: (e: ExerciseEntry) => void; onRemove: () => void; suggestions: string }) {
  const { settings } = useSettings()
  const { maxes } = useLog()
  const wf = weightFactor(settings.units)
  const wu = weightUnit(settings.units)
  const oneRm = entry.oneRmKg
  const stats = exerciseStats(entry)

  const setSet = (i: number, patch: Partial<StrengthSet>) => onChange({ ...entry, sets: entry.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <input
            className={`${inputClass} font-semibold`}
            list={suggestions}
            placeholder="Exercise, e.g. Back squat"
            value={entry.name}
            onChange={(e) => onChange({ ...entry, name: e.target.value, oneRmKg: findMax(maxes, e.target.value)?.kg })}
          />
          <p className="mt-1 text-xs text-muted">
            {oneRm ? (
              <>
                1RM {formatWeight(oneRm, settings.units)}
                {wu} — type a weight or a % of it
              </>
            ) : (
              <>
                No 1RM saved for this lift.{' '}
                <Link to="/log/maxes" className="font-medium text-accent-strong">
                  Add one
                </Link>{' '}
                to log by %.
              </>
            )}
          </p>
        </div>
        <button type="button" aria-label="Remove exercise" onClick={onRemove} className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text">
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="mt-3 space-y-2">
        <div className="grid grid-cols-[1.75rem_1.7fr_1fr_0.9fr_0.9fr_1.75rem] gap-1 px-0.5 text-xs font-medium text-muted">
          <span>Set</span>
          <span>{wu}</span>
          <span>% 1RM</span>
          <span>Reps</span>
          <span>RPE</span>
          <span />
        </div>
        {entry.sets.map((s, i) => (
          <div key={s.id} className="grid grid-cols-[1.75rem_1.7fr_1fr_0.9fr_0.9fr_1.75rem] items-center gap-1">
            <button
              type="button"
              title={s.warmup ? 'Warm-up set (tap for working set)' : 'Working set (tap to mark as warm-up)'}
              onClick={() => setSet(i, { warmup: !s.warmup })}
              className={`tabular h-full rounded-lg text-sm font-semibold ${s.warmup ? 'bg-surface-2 text-muted' : 'bg-accent-soft text-accent-strong'}`}
            >
              {s.warmup ? 'W' : entry.sets.slice(0, i + 1).filter((x) => !x.warmup).length}
            </button>
            <NumberInput aria-label="Weight" className="!px-1 text-center" value={s.weightKg} factor={wf} decimals={1} onChange={(weightKg) => setSet(i, { weightKg })} />
            <NumberInput
              aria-label="Percent of 1RM" className="!px-1 text-center"
              disabled={!oneRm}
              value={oneRm && s.weightKg != null ? (s.weightKg / oneRm) * 100 : undefined}
              decimals={0}
              placeholder={oneRm ? '%' : '—'}
              onChange={(pct) => oneRm && setSet(i, { weightKg: pct == null ? undefined : Math.round(((pct / 100) * oneRm) / (wf / 2)) * (wf / 2) })}
            />
            <NumberInput aria-label="Reps" className="!px-1 text-center" integer value={s.reps} onChange={(reps) => setSet(i, { reps })} />
            <NumberInput aria-label="Set RPE" className="!px-1 text-center" value={s.rpe} decimals={1} onChange={(rpe) => setSet(i, { rpe })} />
            <button
              type="button"
              aria-label="Remove set"
              onClick={() => onChange({ ...entry, sets: entry.sets.filter((_, j) => j !== i) })}
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            const last = entry.sets.at(-1)
            onChange({ ...entry, sets: [...entry.sets, { id: newId(), reps: last?.reps, weightKg: last?.weightKg }] })
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2"
        >
          <Plus className="size-4" /> Add set
        </button>
        {stats.sets > 0 && (
          <span className="tabular text-xs text-muted">
            {stats.sets} sets · {stats.reps} reps · {formatWeight(stats.volumeKg, settings.units)}
            {wu} volume{stats.e1rm ? ` · e1RM ${formatWeight(stats.e1rm, settings.units)}${wu}` : ''}
          </span>
        )}
      </div>
      <input className={`${inputClass} mt-2`} placeholder="Notes (tempo, cues, pain…)" value={entry.notes ?? ''} onChange={(e) => onChange({ ...entry, notes: e.target.value || undefined })} />
    </div>
  )
}

function StrengthEditor({ exercises, onChange }: { exercises: ExerciseEntry[]; onChange: (e: ExerciseEntry[]) => void }) {
  const { maxes, sessions } = useLog()
  const listId = 'exercise-names'
  const used = new Set<string>([...MAIN_LIFTS, ...maxes.map((m) => m.exercise)])
  for (const s of sessions) for (const e of s.exercises ?? []) if (e.name) used.add(e.name)

  return (
    <div className="space-y-3">
      <datalist id={listId}>
        {[...used].sort().map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {exercises.map((e, i) => (
        <ExerciseEditor
          key={e.id}
          entry={e}
          suggestions={listId}
          onChange={(next) => onChange(exercises.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(exercises.filter((_, j) => j !== i))}
        />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onChange([...exercises, { id: newId(), name: '', sets: [{ id: newId() }] }])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2"
        >
          <Plus className="size-4" /> Add exercise
        </button>
        <Link to="/log/maxes" className="text-sm font-medium text-accent-strong">
          Manage 1RMs
        </Link>
      </div>
    </div>
  )
}

function WodEditor({ wod, onChange }: { wod: Wod; onChange: (w: Wod | undefined) => void }) {
  const set = (p: Partial<Wod>) => onChange({ ...wod, ...p })
  return (
    <div className="space-y-3">
      <Chips value={wod.format} allowNone={false} options={WOD_FORMATS} onChange={(format) => format && set({ format })} />
      <TextArea value={wod.description} onChange={(description) => set({ description })} placeholder={'e.g. 21-15-9\nThrusters 43kg\nPull-ups'} rows={4} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label={wod.format === 'emom' ? 'Length' : 'Time cap'}>
          <TimeInput value={wod.timeCapSec} onChange={(timeCapSec) => set({ timeCapSec })} />
        </Field>
        {wod.format === 'fortime' ? (
          <Field label="Finish time">
            <TimeInput value={wod.resultSec} onChange={(resultSec) => set({ resultSec })} />
          </Field>
        ) : (
          <>
            <Field label="Rounds">
              <NumberInput integer value={wod.rounds} onChange={(rounds) => set({ rounds })} />
            </Field>
            <Field label="+ Reps">
              <NumberInput integer value={wod.reps} onChange={(reps) => set({ reps })} />
            </Field>
          </>
        )}
        <div className="flex items-end pb-2.5">
          <Toggle checked={!!wod.rx} onChange={(rx) => set({ rx })} label="Rx" />
        </div>
      </div>
      <button type="button" onClick={() => onChange(undefined)} className="text-sm font-medium text-muted hover:text-text">
        Remove WOD
      </button>
    </div>
  )
}

// ---- All fields for one session -------------------------------------------

/** Everything about a session except the sport picker. Used for standalone sessions and for multisport legs. */
export function SessionFields({ draft, onChange, leg = false }: { draft: SessionDraft; onChange: Patch; leg?: boolean }) {
  const { settings } = useSettings()
  const def = SPORTS[draft.sport]
  const kind = paceKind(draft.sport, settings.units)
  const distUnit = distanceUnit(draft.sport, settings.units)
  const isRow = draft.sport === 'row' || draft.sport === 'erg'
  const moving = !['strength', 'recovery', 'transition'].includes(draft.sport)
  const load = sessionLoad(draft)

  if (draft.sport === 'transition') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start time" hint="Optional">
          <input type="time" step={1} className={inputClass} value={draft.startTime ?? ''} onChange={(e) => onChange({ startTime: e.target.value || undefined })} />
        </Field>
        <Field label="Duration">
          <TimeInput value={draft.durationSec} onChange={(durationSec) => onChange({ durationSec })} />
        </Field>
      </div>
    )
  }

  const pieces = draft.pieces ?? []
  const exercises = draft.exercises ?? []
  const wantsPieces = ['intervals', 'pieces', 'test'].includes(draft.type ?? '') || pieces.length > 0
  const detailSummary = [draft.hrAvg && `${draft.hrAvg} bpm`, draft.rate && `${draft.rate} ${isRow ? 'spm' : ''}`, draft.watts && `${draft.watts}W`].filter(Boolean).join(' · ')

  return (
    <div className="space-y-4">
      {def.types.length > 0 && (
        <Chips
          value={draft.type}
          options={def.types}
          onChange={(type) => onChange({ type, ...((type === 'wod' || type === 'mixed') && !draft.wod ? { wod: { format: 'amrap' } } : {}) })}
        />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(draft.sport === 'other' || !leg) && (
          <Field label="Title" className="col-span-2 sm:col-span-3">
            <TextInput value={draft.title} onChange={(title) => onChange({ title })} placeholder={draft.sport === 'other' ? 'What did you do?' : 'Optional, e.g. 3×20′ UT2'} />
          </Field>
        )}
        {!leg && (
          <Field label="Date">
            <input type="date" className={inputClass} value={draft.date} required onChange={(e) => onChange({ date: e.target.value })} />
          </Field>
        )}
        <Field label="Start time" hint={leg ? 'Used to work out transitions' : undefined}>
          <input type="time" step={leg ? 1 : 60} className={inputClass} value={draft.startTime ?? ''} onChange={(e) => onChange({ startTime: e.target.value || undefined })} />
        </Field>
        {moving ? (
          <DistTimePace
            kind={kind}
            distUnit={distUnit}
            distM={draft.distanceM}
            sec={draft.durationSec}
            timeLabel="Duration"
            onChange={(v) => onChange({ distanceM: v.distM, durationSec: v.sec })}
          />
        ) : (
          <Field label="Duration">
            <TimeInput value={draft.durationSec} placeholder="h:mm:ss" onChange={(durationSec) => onChange({ durationSec })} />
          </Field>
        )}
      </div>

      {moving && draft.sport !== 'other' && (
        <AimToggle
          sport={draft.sport}
          value={draft}
          onChange={(a) => onChange({ target: a.target, hrZone: a.hrZone, targetRate: a.targetRate })}
          label="Add a session target (e.g. Z2, r18)"
        />
      )}

      <Field label="Effort (RPE)" hint={load != null ? `Session load ${load} (RPE × minutes)` : 'Session load = RPE × minutes, once duration is in.'}>
        <Scale value={draft.rpe} onChange={(rpe) => onChange({ rpe })} low="Very easy" high="Max" describe={(v) => RPE_LABELS[v]} />
      </Field>

      <Section title="Heart rate & metrics" summary={detailSummary}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="HR avg" unit="bpm">
            <NumberInput integer value={draft.hrAvg} onChange={(hrAvg) => onChange({ hrAvg })} />
          </Field>
          <Field label="HR max" unit="bpm">
            <NumberInput integer value={draft.hrMax} onChange={(hrMax) => onChange({ hrMax })} />
          </Field>
          {moving && draft.sport !== 'other' && (
            <Field label={isRow ? 'Stroke rate' : draft.sport === 'swim' ? 'Strokes' : 'Cadence'} unit={isRow || draft.sport === 'run' ? 'spm' : draft.sport === 'bike' ? 'rpm' : '/len'}>
              <NumberInput integer value={draft.rate} onChange={(rate) => onChange({ rate })} />
            </Field>
          )}
          {(draft.sport === 'erg' || draft.sport === 'bike') && (
            <Field label="Avg watts">
              <NumberInput
                integer
                value={draft.watts}
                onChange={(watts) => onChange({ watts })}
                placeholder={draft.sport === 'erg' ? String(ergWatts(paceValue('split500', draft.distanceM, draft.durationSec)) ?? '') : ''}
              />
            </Field>
          )}
          {draft.sport === 'bike' && (
            <Field label="Norm. power" unit="W">
              <NumberInput integer value={draft.normWatts} onChange={(normWatts) => onChange({ normWatts })} />
            </Field>
          )}
          {draft.sport === 'erg' && (
            <Field label="Drag factor">
              <NumberInput integer value={draft.dragFactor} onChange={(dragFactor) => onChange({ dragFactor })} />
            </Field>
          )}
          {(draft.sport === 'run' || draft.sport === 'bike') && (
            <Field label="Elevation" unit={elevationUnit(settings.units)}>
              <NumberInput integer value={draft.elevationM} factor={elevationFactor(settings.units)} decimals={0} onChange={(elevationM) => onChange({ elevationM })} />
            </Field>
          )}
          {(draft.sport === 'run' || draft.sport === 'bike') && (
            <div className="flex items-end pb-2.5">
              <Toggle checked={!!draft.indoor} onChange={(indoor) => onChange({ indoor })} label={draft.sport === 'run' ? 'Treadmill' : 'Indoor'} />
            </div>
          )}
        </div>

        <p className="mb-2 mt-5 text-xs font-medium text-muted">Time in heart-rate zones</p>
        <div className="grid grid-cols-5 gap-2">
          {[0, 1, 2, 3, 4].map((z) => (
            <Field key={z} label={`Z${z + 1}`}>
              <TimeInput
                value={draft.zonesSec?.[z]}
                onChange={(v) => {
                  const zones = [...(draft.zonesSec ?? [])]
                  zones[z] = v
                  onChange({ zonesSec: zones.some((x) => x != null) ? zones : undefined })
                }}
              />
            </Field>
          ))}
        </div>
      </Section>

      {def.pieces && (
        <Section
          key={`pieces-${wantsPieces}`}
          title="Pieces"
          defaultOpen={wantsPieces}
          summary={pieces.length ? `${pieces.length} pieces` : 'Log every rep'}
        >
          <PiecesEditor sport={draft.sport} pieces={pieces} onChange={(p) => onChange({ pieces: p.length ? p : undefined })} />
        </Section>
      )}

      {draft.sport === 'strength' && draft.type !== 'wod' && (
        <Section title="Exercises" defaultOpen summary={exercises.length ? `${exercises.length} exercises` : undefined}>
          <StrengthEditor exercises={exercises} onChange={(e) => onChange({ exercises: e.length ? e : undefined })} />
        </Section>
      )}

      {draft.sport === 'strength' &&
        (draft.wod ? (
          <Section key="wod" title="WOD" defaultOpen>
            <WodEditor wod={draft.wod} onChange={(wod) => onChange({ wod })} />
          </Section>
        ) : (
          <button
            type="button"
            onClick={() => onChange({ wod: { format: 'amrap' } })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-2 text-sm font-semibold text-muted hover:text-text"
          >
            <Plus className="size-4" /> Add a WOD
          </button>
        ))}

      <Field label="How it felt">
        <MultiChips value={draft.feel ?? []} options={FEEL_TAGS} onChange={(feel) => onChange({ feel: feel.length ? feel : undefined })} />
      </Field>
      <Field label="Notes">
        <TextArea value={draft.notes} onChange={(notes) => onChange({ notes })} placeholder="Conditions, technique, anything worth remembering" />
      </Field>
    </div>
  )
}
