import { BookOpen, Repeat, Waypoints } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/ui'
import { sessionFromWorkout } from '../../library/workouts'
import { blankSession, copyOf } from '../../log/drafts'
import { formatDate } from '../../log/format'
import { useLog, type SessionDraft } from '../../log/LogStore'
import { LOGGABLE, SPORTS, sessionName } from '../../log/sports'
import { sortSessions } from '../../log/stats'
import type { Sport } from '../../log/types'
import { SessionFields } from './SessionFields'

export function SportPicker({ value, onPick, multisport = true }: { value?: Sport; onPick: (s: Sport) => void; multisport?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
      {LOGGABLE.map((sport) => {
        const def = SPORTS[sport]
        const on = sport === value
        return (
          <button
            key={sport}
            type="button"
            onClick={() => onPick(sport)}
            className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm font-medium transition ${
              on ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-surface hover:bg-surface-2'
            }`}
          >
            <def.icon className={`size-5 ${on ? '' : def.text}`} />
            {def.label}
          </button>
        )
      })}
      {multisport && (
        <Link to="/log/multi/new" className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface px-2 py-3 text-sm font-medium transition hover:bg-surface-2">
          <Waypoints className="size-5 text-muted" />
          Multisport
        </Link>
      )}
    </div>
  )
}

function Form({ initial, editing }: { initial: SessionDraft; editing: boolean }) {
  const { sessions, workouts, saveSession } = useLog()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(initial)
  const workout = workouts.find((w) => w.id === draft.workoutId)
  const patch = (p: Partial<SessionDraft>) => setDraft((d) => ({ ...d, ...p }))

  const last = sortSessions(sessions.filter((s) => s.sport === draft.sport && s.id !== draft.id))[0]

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const saved = saveSession(draft)
    navigate(`/log/session/${saved.id}`, { replace: editing })
  }

  return (
    <form onSubmit={submit} className="space-y-5 pb-24">
      {workout && (
        <div className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm">
          <BookOpen className="size-4 shrink-0 text-accent-strong" />
          <span className="min-w-0 flex-1">
            From your library: <Link to={`/library/${workout.id}`} className="font-semibold text-accent-strong">{workout.name}</Link>
            <span className="block text-xs text-muted">Targets and the planned work are filled in. Change anything to what actually happened.</span>
          </span>
          {!editing && (
            <button type="button" onClick={() => setDraft((d) => ({ ...d, workoutId: undefined }))} className="shrink-0 text-xs font-medium text-muted hover:text-text">
              Unlink
            </button>
          )}
        </div>
      )}

      {!editing && !workout && <SportPicker value={draft.sport} onPick={(sport) => patch({ sport, type: undefined })} />}

      {!editing && !workout && last && (
        <button
          type="button"
          onClick={() => setDraft(copyOf(last))}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-left text-sm hover:bg-surface-2"
        >
          <Repeat className="size-4 shrink-0 text-muted" />
          <span className="min-w-0 truncate">
            Repeat last {SPORTS[draft.sport].label.toLowerCase()}: <span className="font-semibold">{sessionName(last)}</span>
            <span className="text-muted"> · {formatDate(last.date)}</span>
          </span>
        </button>
      )}

      <SessionFields draft={draft} onChange={patch} />

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-2 md:px-4">
          <button type="button" onClick={() => navigate(-1)} className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">
            Cancel
          </button>
          <button type="submit" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90">
            {editing ? 'Save changes' : 'Save session'}
          </button>
        </div>
      </div>
    </form>
  )
}

export function NewSession() {
  const [params] = useSearchParams()
  const { sessions, workouts, maxes } = useLog()
  const from = sessions.find((s) => s.id === params.get('from'))
  const workout = workouts.find((w) => w.id === params.get('workout'))
  const sport = (params.get('sport') as Sport | null) ?? 'erg'
  const date = params.get('date') ?? undefined
  const initial = workout ? sessionFromWorkout(workout, maxes, date) : from ? copyOf(from) : blankSession(SPORTS[sport] ? sport : 'erg', date)
  return (
    <>
      <PageHeader title="Log session" subtitle="Quick: sport, time and RPE. Open the sections for full detail." />
      <Form key={params.toString()} initial={initial} editing={false} />
    </>
  )
}

export function EditSession() {
  const { id } = useParams()
  const { sessions } = useLog()
  const session = sessions.find((s) => s.id === id)
  if (!session) return <Navigate to="/log" replace />
  const def = SPORTS[session.sport]
  return (
    <>
      <PageHeader title="Edit session" subtitle={`${def.label} · ${formatDate(session.date, { weekday: 'long', day: 'numeric', month: 'long' })}`} />
      <Form initial={session} editing />
    </>
  )
}
