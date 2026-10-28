import { ArrowLeft, BookOpen, Check, Lock, Pencil, Play, Repeat, SkipForward, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Chips, Field, FieldGroup, TextArea, TextInput, TimeInput, inputClass } from '../../components/fields'
import { Card, PageHeader, Segmented } from '../../components/ui'
import { formatPlanTime, structureSummary } from '../../library/workouts'
import { formatDate, todayIso } from '../../log/format'
import { useLog } from '../../log/LogStore'
import { SPORTS, WOD_FORMATS, sessionName } from '../../log/sports'
import { describeAim } from '../../log/targets'
import type { Sport } from '../../log/types'
import { weekStart } from '../../plan/dates'
import { INTENSITY_LABEL } from '../../plan/generate'
import { estimateSec } from '../../plan/oneOffs'
import { blockEnd, loggedFor, plannedWorkout } from '../../plan/planned'
import { usePlan, type PlannedDraft } from '../../plan/PlanStore'
import type { Intensity, PlannedSession } from '../../plan/types'
import { useSettings } from '../../settings/SettingsContext'
import { Exercises, History, Structure } from '../library/WorkoutDetail'
import { SportPicker } from '../log/SessionForm'
import { IntensityPill } from './bits'

const INTENSITIES = (['easy', 'moderate', 'key'] as Intensity[]).map((value) => ({ value, label: INTENSITY_LABEL[value] }))

function MoveCard({ p }: { p: PlannedSession }) {
  const { savePlanned } = usePlan()
  const [date, setDate] = useState(p.date)
  const [time, setTime] = useState(p.time ?? '')
  const changed = date !== p.date || time !== (p.time ?? '')
  return (
    <Card title="Move">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Date" className="w-40">
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time" className="w-32">
          <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <button
          type="button"
          disabled={!changed || !date}
          onClick={() => savePlanned({ ...p, date, time: time || undefined, slot: undefined, reason: 'Moved by you', locked: true })}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90 disabled:opacity-50"
        >
          Move
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">Moved sessions stay put when the plan re-fits around new shifts.</p>
    </Card>
  )
}

function SourceCard({ p }: { p: PlannedSession }) {
  const { workouts, saveWorkout } = useLog()
  const { savePlanned } = usePlan()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const options = workouts.filter((w) => w.sport === p.sport && w.id !== p.workoutId).sort((a, b) => a.name.localeCompare(b.name))
  const lib = p.workoutId ? workouts.find((w) => w.id === p.workoutId) : undefined

  const swap = (id: string) => {
    const w = workouts.find((x) => x.id === id)
    if (!w) return
    savePlanned({ ...p, workoutId: w.id, oneOff: undefined, benchmark: undefined, title: w.name, durationSec: estimateSec(w), reason: p.reason, locked: true })
  }

  const toLibrary = () => {
    if (!p.oneOff) return
    const w = saveWorkout({ ...p.oneOff, source: p.oneOff.source ?? 'Training plan one-off' })
    savePlanned({ ...p, workoutId: w.id, oneOff: undefined, locked: true })
    navigate(`/library/${w.id}/edit`)
  }

  return (
    <Card title={lib ? 'From your library' : 'One-off session'}>
      {lib ? (
        <Link to={`/library/${lib.id}`} className="flex items-center gap-2 font-semibold text-accent-strong">
          <BookOpen className="size-4" /> {lib.name}
        </Link>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">Written for this week for variety. Save it to keep it and compare future attempts.</p>
          <button type="button" onClick={toLibrary} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2">
            <BookOpen className="size-4" /> Save to library
          </button>
        </div>
      )}
      {options.length > 0 && (
        <Field label="Swap for a library workout" className="mt-4">
          <select className={inputClass} value="" onChange={(e) => swap(e.target.value)}>
            <option value="">Choose…</option>
            {options.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} · {structureSummary(w, settings.units)}
              </option>
            ))}
          </select>
        </Field>
      )}
    </Card>
  )
}

export default function PlannedDetail() {
  const { id } = useParams()
  const { planned, events, savePlanned, deletePlanned } = usePlan()
  const { workouts, sessions } = useLog()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const p = planned.find((x) => x.id === id)
  if (!p) return <Navigate to="/plan" replace />

  const def = SPORTS[p.sport]
  const w = plannedWorkout(p, workouts)
  const done = loggedFor(p, sessions)
  const event = events.find((e) => e.id === p.eventId)
  const weekHref = `/plan?week=${weekStart(p.date, settings.weekStartsOn)}`
  const logHref = event?.multisport
    ? `/log/multi/new?kind=${event.multisport}&date=${p.date}&title=${encodeURIComponent(p.title)}`
    : `/log/new?plan=${p.id}`
  const steady = w && !w.pieces?.length && !w.exercises?.length && !w.wod
  const aim = w ? describeAim(w, w.sport, settings.units) : ''

  const remove = () => {
    if (!confirm('Remove this session from the plan?')) return
    deletePlanned(p.id)
    navigate(weekHref, { replace: true })
  }

  return (
    <div className="space-y-5">
      <Link to={weekHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Plan
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${def.soft} ${def.text}`}>
            <def.icon className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{p.title}</h1>
            <p className="text-sm text-muted">
              {formatDate(p.date, { weekday: 'long', day: 'numeric', month: 'long' })}
              {p.time && ` · ${p.time}`}
              {p.durationSec ? ` · about ${formatPlanTime(Math.round(p.durationSec / 300) * 300)}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <IntensityPill value={p.intensity} />
              <span className="text-xs text-muted">{def.label}</span>
              {p.benchmark && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-strong">
                  <Repeat className="size-3.5" /> Benchmark: repeats each cycle
                </span>
              )}
              {p.locked && (
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <Lock className="size-3.5" /> Set by you
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/plan/session/${p.id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2">
            <Pencil className="size-4" /> Edit
          </Link>
          {!done && (
            <button
              type="button"
              onClick={() => savePlanned({ ...p, skipped: !p.skipped, locked: true })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2"
            >
              <SkipForward className="size-4" /> {p.skipped ? 'Unskip' : 'Skip'}
            </button>
          )}
          <button type="button" onClick={remove} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-text">
            <Trash2 className="size-4" /> Remove
          </button>
        </div>
      </div>

      {done ? (
        <Link to={`/log/session/${done.id}`} className="flex items-center gap-3 rounded-xl border border-hit/40 bg-hit/10 px-4 py-3 text-sm">
          <Check className="size-5 text-hit" />
          <span>
            Done: <span className="font-semibold">{sessionName(done)}</span> on {formatDate(done.date)}
          </span>
        </Link>
      ) : (
        <Link to={logHref} className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3.5 font-semibold text-on-accent hover:opacity-90 sm:inline-flex sm:w-auto">
          <Play className="size-4" /> Log this session
        </Link>
      )}

      {p.reason && (
        <p className="text-sm text-muted">
          <span className="font-medium text-text">Why this day:</span> {p.reason}
        </p>
      )}

      {(w?.description || p.notes || steady) && (
        <Card>
          {steady && (w.durationSec || aim) && (
            <p className="tabular font-semibold">
              {[w.durationSec && formatPlanTime(w.durationSec), aim, w.rpe != null && `RPE ${w.rpe}`].filter(Boolean).join(' · ')}
            </p>
          )}
          {w?.description && <p className={`whitespace-pre-line text-sm ${steady ? 'mt-2' : ''}`}>{w.description}</p>}
          {p.notes && <p className="mt-2 whitespace-pre-line text-sm text-muted">{p.notes}</p>}
        </Card>
      )}

      {w?.pieces?.length ? <Structure w={w} /> : null}
      {w?.exercises?.length ? <Exercises w={w} /> : null}
      {w?.wod && (
        <Card title="WOD">
          <span className="rounded-full bg-sport-strength/15 px-2.5 py-1 text-sm font-semibold">{WOD_FORMATS.find((f) => f.value === w.wod!.format)?.label}</span>
          {w.wod.timeCapSec != null && <span className="ml-2 text-sm text-muted">{formatPlanTime(w.wod.timeCapSec)}</span>}
          {w.wod.description && <p className="mt-3 whitespace-pre-line text-sm">{w.wod.description}</p>}
        </Card>
      )}

      {p.intensity !== 'race' && (
        <div className="grid gap-5 lg:grid-cols-2">
          {!done && <MoveCard key={`${p.date}${p.time}`} p={p} />}
          <SourceCard p={p} />
        </div>
      )}

      {p.workoutId && w && <History w={w} />}
    </div>
  )
}

// ---- Add / edit ---------------------------------------------------------------

function PlannedForm({ initial, editing }: { initial: PlannedDraft; editing: boolean }) {
  const { savePlanned } = usePlan()
  const { workouts } = useLog()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(initial)
  const [source, setSource] = useState<'library' | 'oneoff'>(initial.workoutId ? 'library' : 'oneoff')
  const patch = (p: Partial<PlannedDraft>) => setDraft((d) => ({ ...d, ...p }))
  const options = workouts.filter((w) => w.sport === draft.sport).sort((a, b) => a.name.localeCompare(b.name))
  const lib = workouts.find((w) => w.id === draft.workoutId && w.sport === draft.sport)
  const structured = !!(draft.oneOff?.pieces?.length || draft.oneOff?.exercises?.length || draft.oneOff?.wod)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    let out: PlannedDraft
    if (source === 'library' && lib) {
      out = { ...draft, workoutId: lib.id, oneOff: undefined, title: lib.name, durationSec: draft.durationSec ?? estimateSec(lib) }
    } else {
      const title = draft.title.trim() || sessionName({ sport: draft.sport })
      const base = draft.oneOff ?? { name: title, sport: draft.sport, tags: [] }
      const oneOff = { ...base, name: title, sport: draft.sport, durationSec: structured ? base.durationSec : draft.durationSec }
      out = { ...draft, title, workoutId: undefined, oneOff }
    }
    const saved = savePlanned({ ...out, locked: true, reason: editing ? out.reason : 'Added by you' })
    navigate(`/plan/session/${saved.id}`, { replace: editing })
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-5">
      <Card>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" required className={inputClass} value={draft.date} onChange={(e) => patch({ date: e.target.value })} />
            </Field>
            <Field label="Time">
              <input type="time" className={inputClass} value={draft.time ?? ''} onChange={(e) => patch({ time: e.target.value || undefined })} />
            </Field>
          </div>
          {!editing && <SportPicker value={draft.sport} onPick={(sport: Sport) => patch({ sport, workoutId: undefined, oneOff: undefined })} multisport={false} />}
          <FieldGroup label="Intensity">
            <Chips<Intensity> value={draft.intensity} options={INTENSITIES} onChange={(v) => v && patch({ intensity: v })} allowNone={false} />
          </FieldGroup>
          <Segmented<'library' | 'oneoff'>
            value={source}
            onChange={setSource}
            options={[
              { value: 'library', label: 'From library' },
              { value: 'oneoff', label: 'One-off' },
            ]}
          />
          {source === 'library' ? (
            options.length ? (
              <Field label="Workout">
                <select className={inputClass} required value={lib?.id ?? ''} onChange={(e) => patch({ workoutId: e.target.value || undefined })}>
                  <option value="">Choose…</option>
                  {options.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} · {structureSummary(w, settings.units)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <p className="text-sm text-muted">No {SPORTS[draft.sport].label.toLowerCase()} workouts in your library yet.</p>
            )
          ) : (
            <>
              <Field label="Title">
                <TextInput value={draft.title || undefined} onChange={(v) => patch({ title: v ?? '' })} placeholder="e.g. 45′ easy spin" />
              </Field>
              <Field label="Description">
                <TextArea value={draft.oneOff?.description} onChange={(description) => patch({ oneOff: { ...(draft.oneOff ?? { name: draft.title, sport: draft.sport, tags: [] }), description } })} rows={3} />
              </Field>
            </>
          )}
          <Field label="Planned length" hint={structured ? 'The reps stay as planned; this is just for fitting it into the day.' : undefined}>
            <TimeInput value={draft.durationSec} onChange={(durationSec) => patch({ durationSec })} placeholder="h:mm:ss or minutes" />
          </Field>
          <Field label="Notes">
            <TextArea value={draft.notes} onChange={(notes) => patch({ notes })} rows={2} />
          </Field>
        </div>
      </Card>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => navigate(-1)} className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">
          Cancel
        </button>
        <button type="submit" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90">
          {editing ? 'Save changes' : 'Add to plan'}
        </button>
      </div>
    </form>
  )
}

export function NewPlanned() {
  const [params] = useSearchParams()
  const { blocks } = usePlan()
  const date = params.get('date') ?? todayIso()
  const block = blocks.find((b) => date >= b.start && date <= blockEnd(b))
  return (
    <>
      <PageHeader title="Add a session" subtitle={formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })} />
      <PlannedForm key={date} initial={{ date, sport: 'erg', intensity: 'easy', title: '', blockId: block?.id }} editing={false} />
    </>
  )
}

export function EditPlanned() {
  const { id } = useParams()
  const { planned } = usePlan()
  const p = planned.find((x) => x.id === id)
  if (!p) return <Navigate to="/plan" replace />
  return (
    <>
      <PageHeader title="Edit planned session" subtitle="Edited sessions stay as you set them when the plan re-fits." />
      <PlannedForm initial={p} editing />
    </>
  )
}
