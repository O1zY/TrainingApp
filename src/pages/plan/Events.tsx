import { ArrowLeft, Clock, Flag, Plane, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Field, FieldGroup, TextArea, TextInput, inputClass } from '../../components/fields'
import { chip } from '../../components/styles'
import { Card, EmptyState, PageHeader, Segmented } from '../../components/ui'
import { formatDate, todayIso } from '../../log/format'
import { MULTISPORT_KINDS, SPORTS } from '../../log/sports'
import type { MultisportKind, Sport } from '../../log/types'
import { daysBetween } from '../../plan/dates'
import { raceLabel } from '../../plan/events'
import { useReplan } from '../../plan/planned'
import { usePlan } from '../../plan/PlanStore'
import type { EventKind, PlanEvent, RacePriority } from '../../plan/types'

const PRIORITIES: { value: RacePriority; label: string; hint: string }[] = [
  { value: 'A', label: 'A', hint: 'The goal: taper week before, lighter race week, recovery week after' },
  { value: 'B', label: 'B', hint: 'Matters: a lighter race week, the cycle carries on' },
  { value: 'C', label: 'C', hint: 'Training race: takes a hard session’s place, no taper' },
]

const RACE_SPORTS: Sport[] = ['erg', 'row', 'run', 'bike', 'swim', 'strength']

const ICONS = { race: Flag, away: Plane, busy: Clock }

type Draft = Omit<PlanEvent, 'id'> & { id?: string }

function Form({ initial, editing }: { initial: Draft; editing: boolean }) {
  const { events, saveEvent, deleteEvent } = usePlan()
  const replan = useReplan()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(initial)
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))
  const race = draft.kind === 'race'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const clean: Draft = {
      ...draft,
      name: draft.name.trim() || (race ? 'Race' : draft.kind === 'away' ? 'Away' : 'Busy'),
      endDate: !race && draft.endDate && draft.endDate > draft.date ? draft.endDate : undefined,
      priority: race ? (draft.priority ?? 'B') : undefined,
      sport: race ? draft.sport : undefined,
      multisport: race ? draft.multisport : undefined,
    }
    const saved = saveEvent(clean)
    replan({ events: [...events.filter((x) => x.id !== saved.id), saved] })
    navigate('/plan/events', { replace: editing })
  }

  const remove = () => {
    if (!draft.id || !confirm('Delete this event? The plan re-fits without it.')) return
    deleteEvent(draft.id)
    replan({ events: events.filter((x) => x.id !== draft.id) })
    navigate('/plan/events', { replace: true })
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-5">
      <Card>
        <div className="space-y-4">
          <Segmented<EventKind>
            value={draft.kind}
            onChange={(kind) => patch({ kind })}
            options={[
              { value: 'race', label: 'Race' },
              { value: 'away', label: 'Away' },
              { value: 'busy', label: 'Busy spell' },
            ]}
          />
          <p className="text-sm text-muted">
            {race
              ? 'The plan builds the weeks around it by priority.'
              : draft.kind === 'away'
                ? 'Holiday, travel or a trip with no training. Away four or more days in a week makes that week the deload.'
                : 'Exams, a big week at work, moving house: hard sessions stay off these days and easy ones are kept short.'}
          </p>
          <Field label="Name">
            <TextInput value={draft.name || undefined} onChange={(v) => patch({ name: v ?? '' })} placeholder={race ? 'e.g. Regent’s Park 10k' : draft.kind === 'away' ? 'e.g. Christmas at home' : 'e.g. Stocktake week'} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={race ? 'Date' : 'From'}>
              <input type="date" required className={inputClass} value={draft.date} onChange={(e) => patch({ date: e.target.value })} />
            </Field>
            {!race && (
              <Field label="To">
                <input type="date" className={inputClass} min={draft.date} value={draft.endDate ?? ''} onChange={(e) => patch({ endDate: e.target.value || undefined })} />
              </Field>
            )}
          </div>
          {race && (
            <>
              <FieldGroup label="Priority" hint={PRIORITIES.find((p) => p.value === (draft.priority ?? 'B'))!.hint}>
                <div className="flex gap-1.5">
                  {PRIORITIES.map((p) => (
                    <button key={p.value} type="button" className={`${chip((draft.priority ?? 'B') === p.value)} w-12`} onClick={() => patch({ priority: p.value })}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </FieldGroup>
              <FieldGroup label="Sport">
                <div className="flex flex-wrap gap-1.5">
                  {RACE_SPORTS.map((s) => (
                    <button key={s} type="button" className={chip(draft.sport === s && !draft.multisport)} onClick={() => patch({ sport: s, multisport: undefined })}>
                      {SPORTS[s].label}
                    </button>
                  ))}
                  {MULTISPORT_KINDS.filter((k) => k.legs.length).map((k) => (
                    <button key={k.value} type="button" className={chip(draft.multisport === k.value)} onClick={() => patch({ multisport: k.value as MultisportKind, sport: k.legs[0] })}>
                      {k.label}
                    </button>
                  ))}
                </div>
              </FieldGroup>
            </>
          )}
          <Field label="Notes">
            <TextArea value={draft.notes} onChange={(notes) => patch({ notes })} rows={2} />
          </Field>
        </div>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editing ? (
          <button type="button" onClick={remove} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-text">
            <Trash2 className="size-4" /> Delete
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate(-1)} className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">
            Cancel
          </button>
          <button type="submit" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90">
            Save and re-plan
          </button>
        </div>
      </div>
    </form>
  )
}

export function NewEvent() {
  return (
    <>
      <PageHeader title="Add race or event" />
      <Form initial={{ kind: 'race', name: '', date: todayIso(), priority: 'B' }} editing={false} />
    </>
  )
}

export function EditEvent() {
  const { id } = useParams()
  const { events } = usePlan()
  const event = events.find((e) => e.id === id)
  if (!event) return <Navigate to="/plan/events" replace />
  return (
    <>
      <PageHeader title="Edit event" />
      <Form initial={event} editing />
    </>
  )
}

export default function Events() {
  const { events } = usePlan()
  const today = todayIso()
  const upcoming = events.filter((e) => (e.endDate ?? e.date) >= today)
  const past = events.filter((e) => (e.endDate ?? e.date) < today).reverse()

  const addButton = (
    <Link to="/plan/events/new" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90">
      <Plus className="size-4" /> Add
    </Link>
  )

  const row = (e: PlanEvent) => {
    const Icon = ICONS[e.kind]
    const days = daysBetween(today, e.date)
    return (
      <li key={e.id}>
        <Link to={`/plan/events/${e.id}/edit`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2">
          <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${e.kind === 'race' ? 'bg-phase-race/15 text-phase-race' : 'bg-surface-2 text-muted'}`}>
            <Icon className="size-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{e.name}</span>
            <span className="block text-xs text-muted">
              {formatDate(e.date)}
              {e.endDate && ` – ${formatDate(e.endDate)}`}
              {e.kind === 'race' && raceLabel(e) && ` · ${raceLabel(e)}`}
            </span>
          </span>
          {days >= 0 && <span className="tabular shrink-0 text-sm text-muted">{days === 0 ? 'Today' : `${days}d`}</span>}
        </Link>
      </li>
    )
  }

  return (
    <div className="space-y-5">
      <Link to="/plan" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Plan
      </Link>
      <PageHeader title="Races & events" subtitle="What the plan bends around: races by priority, time away, busy spells" action={addButton} />
      {events.length ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Coming up">{upcoming.length ? <ul className="-mx-2">{upcoming.map(row)}</ul> : <p className="text-sm text-muted">Nothing ahead.</p>}</Card>
          {past.length > 0 && (
            <Card title="Past">
              <ul className="-mx-2">{past.map(row)}</ul>
            </Card>
          )}
        </div>
      ) : (
        <EmptyState icon={Flag} title="No races or events" body="Add your target races (A, B or C) and any time away. A races get a taper and a recovery week; a week mostly away becomes the deload." />
      )}
    </div>
  )
}
