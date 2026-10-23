import { ArrowDown, ArrowLeft, ArrowLeftRight, ArrowUp, Link2, Pencil, Plus, Trash2, Unlink } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Chips, Field, TextArea, TextInput, Toggle, inputClass } from '../../components/fields'
import { Card, PageHeader } from '../../components/ui'
import { clockToSec, distanceUnit, formatDate, formatDistance, formatTime, newId, secToClock, todayIso } from '../../log/format'
import { useLog, type SessionDraft } from '../../log/LogStore'
import { LEG_SPORTS, MULTISPORT_KINDS, SPORTS, eventName, kindLabel, sessionName } from '../../log/sports'
import { multisportTimeline, sessionLoad } from '../../log/stats'
import type { Multisport, MultisportKind, Session, Sport } from '../../log/types'
import { useSettings } from '../../settings/SettingsContext'
import { blankSession } from '../../log/drafts'
import { SessionFields } from './SessionFields'
import { SessionStats } from './SessionDetail'

type EventDraft = Omit<Multisport, 'id' | 'legIds' | 'createdAt' | 'updatedAt'> & { id?: string }
/** Legs need a stable key in the form before they have a saved id. */
type LegDraft = SessionDraft & { key: string }


function legFor(sport: Sport, date: string): LegDraft {
  return { ...blankSession(sport, date), startTime: undefined, key: newId() }
}

/** Shown between two legs in the form: the worked-out transition, or a button to add an explicit one. */
function Gap({ prev, next, onInsert }: { prev: SessionDraft; next: SessionDraft; onInsert: () => void }) {
  if (prev.sport === 'transition' || next.sport === 'transition') return null
  const prevStart = clockToSec(prev.startTime)
  const start = clockToSec(next.startTime)
  const gap = prevStart != null && start != null && prev.durationSec != null ? start - (prevStart + prev.durationSec) : undefined
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-1 text-xs text-muted">
      <ArrowLeftRight className="size-3.5" />
      {gap == null ? (
        <span>Transition worked out from finish and start times once both are in</span>
      ) : gap < 0 ? (
        <span className="text-sport-run">Next leg starts before this one finishes — check the times</span>
      ) : (
        <span>
          Transition <span className="tabular font-semibold text-text">{formatTime(gap)}</span> (worked out)
        </span>
      )}
      {prevStart != null && prev.durationSec != null && <span className="tabular">· finished {secToClock(prevStart + prev.durationSec)}</span>}
      <button type="button" onClick={onInsert} className="font-medium text-accent-strong">
        Log transition separately
      </button>
    </div>
  )
}

function Form({ initialEvent, initialLegs, editing }: { initialEvent: EventDraft; initialLegs: LegDraft[]; editing: boolean }) {
  const { sessions, saveMultisport } = useLog()
  const navigate = useNavigate()
  const [event, setEvent] = useState(initialEvent)
  const [legs, setLegs] = useState(initialLegs)
  const [linkId, setLinkId] = useState('')

  const setLeg = (i: number, p: Partial<SessionDraft>) => setLegs((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))
  const move = (i: number, dir: -1 | 1) =>
    setLegs((ls) => {
      const next = [...ls]
      ;[next[i], next[i + dir]] = [next[i + dir], next[i]]
      return next
    })
  const insert = (at: number, leg: LegDraft) => setLegs((ls) => [...ls.slice(0, at), leg, ...ls.slice(at)])

  // Sessions already logged that day (e.g. a run and ride logged separately) can be linked in as legs.
  const inForm = new Set(legs.map((l) => l.id))
  const linkable = sessions.filter((s) => s.date === event.date && !inForm.has(s.id) && (!s.multisportId || s.multisportId === event.id))

  const pickKind = (kind: MultisportKind | undefined) => {
    if (!kind) return
    const untouched = legs.every((l) => !l.id && l.durationSec == null && l.distanceM == null)
    setEvent((e) => ({ ...e, kind }))
    if (untouched) setLegs(MULTISPORT_KINDS.find((k) => k.value === kind)!.legs.map((s) => legFor(s, event.date)))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const saved = saveMultisport(event, legs.map(({ key: _key, ...l }) => l))
    navigate(`/log/multi/${saved.id}`, { replace: editing })
  }

  return (
    <form onSubmit={submit} className="space-y-5 pb-24">
      <Card>
        <div className="space-y-4">
          <Chips value={event.kind} allowNone={false} options={MULTISPORT_KINDS} onChange={pickKind} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Name" className="col-span-2">
              <TextInput value={event.title} onChange={(title) => setEvent((e) => ({ ...e, title }))} placeholder="e.g. Thruxton Sprint Duathlon" />
            </Field>
            <Field label="Date">
              <input type="date" required className={inputClass} value={event.date} onChange={(e) => setEvent((ev) => ({ ...ev, date: e.target.value }))} />
            </Field>
          </div>
          <Toggle checked={!!event.race} onChange={(race) => setEvent((e) => ({ ...e, race }))} label="Race" />
        </div>
      </Card>

      {legs.map((leg, i) => {
        const def = SPORTS[leg.sport]
        return (
          <div key={leg.key}>
            {i > 0 && <Gap prev={legs[i - 1]} next={leg} onInsert={() => insert(i, legFor('transition', event.date))} />}
            <section className="rounded-2xl border border-line bg-surface">
              <div className="flex items-center gap-3 border-b border-line px-4 py-3 md:px-5">
                <span className={`grid size-8 place-items-center rounded-lg ${def.soft} ${def.text}`}>
                  <def.icon className="size-4" />
                </span>
                <select
                  aria-label="Leg sport"
                  className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
                  value={leg.sport}
                  onChange={(e) => setLeg(i, { sport: e.target.value as Sport, type: undefined })}
                >
                  {LEG_SPORTS.map((s) => (
                    <option key={s} value={s}>
                      Leg {i + 1} · {SPORTS[s].label}
                    </option>
                  ))}
                </select>
                <span className="flex">
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30">
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={i === legs.length - 1}
                    onClick={() => move(i, 1)}
                    className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30"
                  >
                    <ArrowDown className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={leg.id ? 'Unlink leg' : 'Remove leg'}
                    title={leg.id ? 'Unlink: the session stays in your log' : 'Remove leg'}
                    onClick={() => setLegs((ls) => ls.filter((_, j) => j !== i))}
                    className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2"
                  >
                    {leg.id ? <Unlink className="size-4" /> : <Trash2 className="size-4" />}
                  </button>
                </span>
              </div>
              <div className="px-4 py-4 md:px-5">
                <SessionFields leg draft={leg} onChange={(p) => setLeg(i, p)} />
              </div>
            </section>
          </div>
        )
      })}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-2">
          {(['run', 'bike', 'swim', 'transition'] as Sport[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setLegs((ls) => [...ls, legFor(s, event.date)])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2"
            >
              <Plus className="size-4" /> {SPORTS[s].label}
            </button>
          ))}
        </div>
        {linkable.length > 0 && (
          <div className="flex min-w-0 flex-1 gap-2 sm:justify-end">
            <select aria-label="Link an existing session" className={`${inputClass} sm:max-w-xs`} value={linkId} onChange={(e) => setLinkId(e.target.value)}>
              <option value="">Link a session from this day…</option>
              {linkable.map((s) => (
                <option key={s.id} value={s.id}>
                  {sessionName(s)}
                  {s.startTime ? ` · ${s.startTime.slice(0, 5)}` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!linkId}
              onClick={() => {
                const s = sessions.find((x) => x.id === linkId)
                if (s) setLegs((ls) => [...ls, { ...s, key: s.id }])
                setLinkId('')
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2 disabled:opacity-40"
            >
              <Link2 className="size-4" /> Link
            </button>
          </div>
        )}
      </div>

      <Card>
        <Field label="Event notes">
          <TextArea value={event.notes} onChange={(notes) => setEvent((e) => ({ ...e, notes }))} placeholder="Course, conditions, pacing, what to change next time" />
        </Field>
      </Card>

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-2 md:px-4">
          <button type="button" onClick={() => navigate(-1)} className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">
            Cancel
          </button>
          <button type="submit" disabled={!legs.length} className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90 disabled:opacity-40">
            {editing ? 'Save changes' : 'Save event'}
          </button>
        </div>
      </div>
    </form>
  )
}

export function NewMultisport() {
  const date = todayIso()
  return (
    <>
      <PageHeader title="Log multisport" subtitle="Each leg is its own session, linked together. Transitions are worked out from finish and start times if you don’t log them." />
      <Form initialEvent={{ kind: 'duathlon', date }} initialLegs={MULTISPORT_KINDS[0].legs.map((s) => legFor(s, date))} editing={false} />
    </>
  )
}

export function EditMultisport() {
  const { id } = useParams()
  const { multisport, sessions } = useLog()
  const event = multisport.find((m) => m.id === id)
  if (!event) return <Navigate to="/log" replace />
  const legs = event.legIds.map((l) => sessions.find((s) => s.id === l)).filter((s): s is Session => !!s)
  return (
    <>
      <PageHeader title="Edit multisport" subtitle={`${eventName(event)} · ${formatDate(event.date)}`} />
      <Form initialEvent={event} initialLegs={legs.map((l) => ({ ...l, key: l.id }))} editing />
    </>
  )
}

export function MultisportDetail() {
  const { id } = useParams()
  const { multisport, sessions, deleteMultisport } = useLog()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const event = multisport.find((m) => m.id === id)
  if (!event) return <Navigate to="/log" replace />

  const legs = event.legIds.map((l) => sessions.find((s) => s.id === l)).filter((s): s is Session => !!s)
  const { items, totalSec, transitionSec } = multisportTimeline(legs)
  const distM = legs.reduce((a, l) => a + (l.distanceM ?? 0), 0)
  const load = legs.reduce((a, l) => a + (sessionLoad(l) ?? 0), 0)
  const distUnit = distanceUnit('run', settings.units)

  return (
    <div className="space-y-5">
      <Link to="/log" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Log
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{eventName(event)}</h1>
          <p className="text-sm text-muted">
            {kindLabel(event.kind)}
            {event.race && ' race'} · {formatDate(event.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/log/multi/${event.id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2">
            <Pencil className="size-4" /> Edit
          </Link>
          <button
            type="button"
            onClick={() => {
              if (!confirm(`Delete this event and its ${legs.length} legs? This can’t be undone.`)) return
              deleteMultisport(event.id)
              navigate('/log', { replace: true })
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-text"
          >
            <Trash2 className="size-4" /> Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <div className="text-xs font-medium text-muted">Total time</div>
          <div className="tabular mt-0.5 text-lg font-bold">{formatTime(totalSec) || '—'}</div>
        </div>
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <div className="text-xs font-medium text-muted">Transitions</div>
          <div className="tabular mt-0.5 text-lg font-bold">{formatTime(transitionSec) || '—'}</div>
        </div>
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <div className="text-xs font-medium text-muted">Distance</div>
          <div className="tabular mt-0.5 text-lg font-bold">
            {distM ? formatDistance(distM, distUnit) : '—'}
            <span className="ml-1 text-xs font-medium text-muted">{distUnit}</span>
          </div>
        </div>
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <div className="text-xs font-medium text-muted">Load</div>
          <div className="tabular mt-0.5 text-lg font-bold">{load || '—'}</div>
        </div>
      </div>

      <Card title="Splits">
        <ol className="space-y-2">
          {items.map((it, i) => {
            if (it.kind === 'gap' || it.session?.sport === 'transition') {
              return (
                <li key={i} className="flex items-center gap-3 px-3 text-sm text-muted">
                  <ArrowLeftRight className="size-4" />
                  <span className="font-semibold">{it.label}</span>
                  <span className="tabular">{formatTime(it.sec) || '—'}</span>
                  <span className="text-xs">{it.kind === 'gap' ? (it.sec == null ? 'add start times to work this out' : 'worked out from times') : 'logged'}</span>
                </li>
              )
            }
            const s = it.session!
            const def = SPORTS[s.sport]
            return (
              <li key={s.id}>
                <Link to={`/log/session/${s.id}`} className="block rounded-xl border border-line p-3 hover:bg-surface-2">
                  <div className="mb-2 flex items-center gap-2">
                    <def.icon className={`size-4 ${def.text}`} />
                    <span className="font-semibold">{sessionName(s)}</span>
                    {s.startTime && <span className="tabular text-sm text-muted">· {s.startTime}</span>}
                  </div>
                  <SessionStats s={s} />
                </Link>
              </li>
            )
          })}
        </ol>
      </Card>

      {event.notes && (
        <Card title="Notes">
          <p className="whitespace-pre-line text-sm">{event.notes}</p>
        </Card>
      )}
    </div>
  )
}
