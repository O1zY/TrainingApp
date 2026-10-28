import { Briefcase, Check, Clock, Flag, Plane, Plus, Repeat } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatPlanTime } from '../../library/workouts'
import { formatDate, todayIso } from '../../log/format'
import { useLog } from '../../log/LogStore'
import { SPORTS } from '../../log/sports'
import { KIND_STYLE, weekLabel, type PlanWeek } from '../../plan/cycle'
import { INTENSITY_LABEL } from '../../plan/generate'
import { raceLabel } from '../../plan/events'
import { DEMANDS, describeDay, type DayLoad, type Strain } from '../../plan/load'
import { loggedFor } from '../../plan/planned'
import type { Commitment, Intensity, PlanEvent, PlannedSession } from '../../plan/types'

const INTENSITY_STYLE: Record<Intensity, string> = {
  easy: 'bg-surface-2 text-muted',
  moderate: 'bg-phase-taper/15 text-phase-taper',
  key: 'bg-phase-race/15 text-phase-race',
  race: 'bg-phase-race text-on-accent',
}

export function IntensityPill({ value }: { value: Intensity }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${INTENSITY_STYLE[value]}`}>{INTENSITY_LABEL[value]}</span>
}

export function KindPill({ week }: { week: Pick<PlanWeek, 'kind' | 'buildNo'> }) {
  const st = KIND_STYLE[week.kind]
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${st.soft} ${st.text}`}>{weekLabel(week)}</span>
}

const STRAIN_DOT: Record<Strain, string> = { low: 'bg-hit', medium: 'bg-over', high: 'bg-miss' }

export function StrainDot({ strain }: { strain: Strain }) {
  return <span className={`inline-block size-2 shrink-0 rounded-full ${STRAIN_DOT[strain]}`} />
}

export function PlannedRow({ p, compact = false }: { p: PlannedSession; compact?: boolean }) {
  const { sessions } = useLog()
  const def = SPORTS[p.sport]
  const done = loggedFor(p, sessions)
  const missed = !done && !p.skipped && p.date < todayIso()
  return (
    <Link
      to={done ? `/log/session/${done.id}` : `/plan/session/${p.id}`}
      className={`flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition hover:border-accent/50 ${p.skipped ? 'opacity-60' : ''}`}
    >
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${def.soft} ${def.text}`}>
        <def.icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-1.5 font-semibold ${p.skipped ? 'line-through' : ''}`}>
          <span className="truncate">{p.title}</span>
          {p.benchmark && <Repeat className="size-3.5 shrink-0 text-accent-strong" aria-label="Benchmark" />}
        </span>
        <span className="tabular flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {!compact && p.time && <span>{p.time}</span>}
          {p.durationSec ? <span>{formatPlanTime(Math.round(p.durationSec / 60) * 60)}</span> : null}
          <IntensityPill value={p.intensity} />
          {p.workoutId && <span>Library</span>}
          {missed && <span className="font-medium text-miss">Missed</span>}
          {p.skipped && <span>Skipped</span>}
        </span>
      </span>
      {done && (
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-hit text-on-accent" aria-label="Done">
          <Check className="size-4" />
        </span>
      )}
    </Link>
  )
}

export function CommitmentLine({ c }: { c: Commitment }) {
  const Icon = c.kind === 'work' ? Briefcase : Clock
  return (
    <span className="flex items-center gap-2 text-sm">
      <Icon className="size-4 shrink-0 text-muted" />
      <span className="tabular">
        {c.start}–{c.end}
      </span>
      <span className="truncate text-muted">
        {[c.title ?? (c.kind === 'work' ? 'Work' : 'Busy'), c.kind === 'work' && DEMANDS[c.demand ?? 'feet'].label].filter(Boolean).join(' · ')}
      </span>
    </span>
  )
}

export function EventLine({ e }: { e: PlanEvent }) {
  const Icon = e.kind === 'race' ? Flag : e.kind === 'away' ? Plane : Clock
  return (
    <Link to={`/plan/events/${e.id}/edit`} className="flex items-center gap-2 text-sm font-medium hover:text-accent-strong">
      <Icon className={`size-4 shrink-0 ${e.kind === 'race' ? 'text-phase-race' : 'text-muted'}`} />
      <span className="truncate">{e.name}</span>
      {e.kind === 'race' && <span className="shrink-0 text-xs text-muted">{raceLabel(e)}</span>}
    </Link>
  )
}

export interface DayInfo {
  date: string
  load: DayLoad
  sessions: PlannedSession[]
  events: PlanEvent[]
}

/** One day of the plan: what's on at work, any events, and the sessions planned around them. */
export function DayRow({ day, restDay }: { day: DayInfo; restDay?: boolean }) {
  const today = todayIso()
  const isToday = day.date === today
  const { load } = day
  return (
    <li className={`flex gap-3 py-3 ${isToday ? '-mx-2 rounded-xl bg-accent-soft/50 px-2' : ''}`}>
      <div className="w-12 shrink-0 text-center">
        <p className={`text-[11px] font-medium uppercase ${isToday ? 'text-accent-strong' : 'text-muted'}`}>{formatDate(day.date, { weekday: 'short' })}</p>
        <p className={`tabular text-lg font-bold ${isToday ? 'text-accent-strong' : ''}`}>{Number(day.date.slice(8))}</p>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <StrainDot strain={load.strain} />
            {describeDay(load)}
            {restDay && !day.sessions.length && ' · rest day'}
          </span>
          {day.events.map((e) => (
            <EventLine key={e.id} e={e} />
          ))}
        </div>
        {load.commitments.map((c) => (
          <CommitmentLine key={c.id} c={c} />
        ))}
        {day.sessions.map((p) => (
          <PlannedRow key={p.id} p={p} />
        ))}
        <Link to={`/plan/session/new?date=${day.date}`} className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-accent-strong">
          <Plus className="size-3.5" /> Add session
        </Link>
      </div>
    </li>
  )
}
