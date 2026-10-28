import { Briefcase, CalendarRange, ChevronLeft, ChevronRight, Flag, Pencil, Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, EmptyState, PageHeader, StatTile } from '../../components/ui'
import { formatDate, todayIso } from '../../log/format'
import { useLog } from '../../log/LogStore'
import { KIND_STYLE, WEEK_KINDS, blockWeeks, kindDef, weekLabel, type PlanWeek } from '../../plan/cycle'
import { addDays, daysBetween, weekDates, weekStart } from '../../plan/dates'
import { covers, raceLabel } from '../../plan/events'
import { dayLoad, weekWork } from '../../plan/load'
import { blockEnd, loggedFor, useReplan } from '../../plan/planned'
import { usePlan } from '../../plan/PlanStore'
import type { Block, WeekKind } from '../../plan/types'
import { useSettings } from '../../settings/SettingsContext'
import { DayRow, KindPill, type DayInfo } from './bits'

/** The block as a row of bars: height is planned volume, colour is the week's phase. */
function BlockWave({ weeks, selected, onPick }: { weeks: PlanWeek[]; selected: string; onPick: (start: string) => void }) {
  const today = todayIso()
  const max = Math.max(...weeks.map((w) => w.volume))
  return (
    <div>
      <div className="-mx-1 flex items-end gap-1 overflow-x-auto px-1 pb-1">
        {weeks.map((w) => {
          const on = w.start === selected
          const current = today >= w.start && today < addDays(w.start, 7)
          const st = KIND_STYLE[w.kind]
          return (
            <button
              key={w.start}
              type="button"
              onClick={() => onPick(w.start)}
              title={`${weekLabel(w)} · ${formatDate(w.start, { day: 'numeric', month: 'short' })}`}
              className={`flex min-w-8 flex-1 flex-col items-center gap-1 rounded-lg px-0.5 pb-1 pt-1.5 transition ${on ? 'bg-surface-2 ring-1 ring-line' : 'hover:bg-surface-2'}`}
            >
              <span className="flex h-14 w-full items-end justify-center">
                <span className={`w-full max-w-7 rounded-md ${st.bg} ${on ? '' : 'opacity-70'}`} style={{ height: `${Math.max(14, (w.volume / max) * 100)}%` }} />
              </span>
              <span className={`text-[11px] font-semibold ${current ? 'text-accent-strong' : 'text-muted'}`}>{w.kind === 'build' ? `B${w.buildNo}` : kindDef(w.kind).short}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {WEEK_KINDS.filter((k) => k.value !== 'recovery' || weeks.some((w) => w.kind === 'recovery')).map((k) => (
          <span key={k.value} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-sm ${KIND_STYLE[k.value].bg}`} /> {k.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function WeekKindPicker({ block, week }: { block: Block; week: PlanWeek }) {
  const { saveBlock, events } = usePlan()
  const replan = useReplan()
  const others = { ...block.weekKinds }
  delete others[week.start]
  const auto = blockWeeks({ ...block, weekKinds: others }, events).find((w) => w.start === week.start)!
  const set = (kind: WeekKind | '') => {
    const weekKinds = { ...block.weekKinds }
    if (kind) weekKinds[week.start] = kind
    else delete weekKinds[week.start]
    const saved = saveBlock({ ...block, weekKinds })
    replan({ blocks: [saved] })
  }
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      Week type
      <select
        className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm font-medium text-text"
        value={block.weekKinds?.[week.start] ?? ''}
        onChange={(e) => set(e.target.value as WeekKind | '')}
      >
        <option value="">Auto ({weekLabel(auto)})</option>
        {WEEK_KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function PlanHome() {
  const { blocks, planned, events, commitments, prefs } = usePlan()
  const { sessions } = useLog()
  const { settings } = useSettings()
  const replan = useReplan()
  const [params, setParams] = useSearchParams()
  const [message, setMessage] = useState<string>()
  const today = todayIso()

  const block =
    blocks.find((b) => b.id === params.get('block')) ??
    blocks.find((b) => today >= b.start && today <= blockEnd(b)) ??
    blocks.find((b) => b.start > today) ??
    blocks.at(-1)
  const weeks = block ? blockWeeks(block, events) : []
  const thisWeek = weekStart(today, settings.weekStartsOn)
  const start = params.get('week') ?? (weeks.some((w) => w.start === thisWeek) ? thisWeek : (weeks[0]?.start ?? thisWeek))
  const week = weeks.find((w) => w.start === start)
  const go = (s: string) => setParams((p) => ({ ...Object.fromEntries(p), week: s }), { replace: true })

  const nextRace = events.find((e) => e.kind === 'race' && e.date >= today)

  const newButton = (
    <Link to="/plan/block/new" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90">
      <Plus className="size-4" /> New block
    </Link>
  )

  const sideCards = (
    <>
      <Card title="Races & events" action={<Link to="/plan/events" className="text-sm font-medium text-accent-strong">Manage</Link>}>
        {nextRace ? (
          <Link to={`/plan/events/${nextRace.id}/edit`} className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-phase-race/15 text-phase-race">
              <Flag className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{nextRace.name}</span>
              <span className="block text-sm text-muted">
                {formatDate(nextRace.date)} · {daysBetween(today, nextRace.date) === 0 ? 'today' : `${daysBetween(today, nextRace.date)} days`}
                {raceLabel(nextRace) && ` · ${raceLabel(nextRace)}`}
              </span>
            </span>
          </Link>
        ) : (
          <p className="text-sm text-muted">No races coming up. Add them and the plan tapers into A races, lightens B races and trains through C races.</p>
        )}
      </Card>
      <Card title="Work & calendar" action={<Link to="/plan/work" className="text-sm font-medium text-accent-strong">Manage</Link>}>
        <WorkSummary />
      </Card>
    </>
  )

  if (!block) {
    return (
      <>
        <PageHeader title="Plan" subtitle="Programmes, training blocks and target races" />
        <EmptyState
          icon={CalendarRange}
          title="No training block yet"
          body="A block runs in cycles of three build weeks and a deload, bent around your races, holidays and work. Add your shifts first and the sessions go where your week has room for them."
        >
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {newButton}
            <Link to="/plan/work" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">
              <Briefcase className="size-4" /> Add work shifts
            </Link>
            <Link to="/plan/events/new" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">
              <Flag className="size-4" /> Add a race
            </Link>
          </div>
        </EmptyState>
        <div className="mt-5 grid gap-5 md:grid-cols-2">{sideCards}</div>
      </>
    )
  }

  const dates = weekDates(start)
  const days: DayInfo[] = dates.map((date) => ({
    date,
    load: dayLoad(date, commitments, prefs),
    sessions: planned.filter((p) => p.date === date),
    events: events.filter((e) => covers(e, date)),
  }))
  const weekPlanned = days.flatMap((d) => d.sessions).filter((p) => p.blockId === block.id || !p.blockId)
  const plannedSec = weekPlanned.filter((p) => !p.skipped).reduce((a, p) => a + (p.durationSec ?? 0), 0)
  const done = weekPlanned.filter((p) => loggedFor(p, sessions)).length
  const work = weekWork(days.map((d) => d.load))
  const idx = weeks.findIndex((w) => w.start === start)
  const current = weeks.findIndex((w) => today >= w.start && today < addDays(w.start, 7))

  const doReplan = () => {
    const { count, notes } = replan({ blocks: [block] })
    setMessage([`Re-planned ${count} session${count === 1 ? '' : 's'} from ${block.start > today ? 'the block start' : 'today'}. Logged, past and hand-edited sessions were kept.`, ...notes].join(' '))
  }

  return (
    <>
      <PageHeader
        title="Plan"
        subtitle={[block.name, current >= 0 ? `Week ${current + 1} of ${block.weeks}` : block.start > today ? `Starts ${formatDate(block.start)}` : 'Finished'].join(' · ')}
        action={
          <Link to={`/plan/block/${block.id}/edit`} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2">
            <Pencil className="size-4" /> Edit block
          </Link>
        }
      />

      <div className="space-y-5">
        <Card
          title={block.goal ? `Block · ${block.goal}` : 'Block'}
          action={
            blocks.length > 1 ? (
              <select
                aria-label="Block"
                className="rounded-lg border border-line bg-surface px-2 py-1 text-sm"
                value={block.id}
                onChange={(e) => setParams({ block: e.target.value })}
              >
                {blocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : undefined
          }
        >
          <BlockWave weeks={weeks} selected={start} onPick={go} />
        </Card>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Card>
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Previous week" onClick={() => go(addDays(start, -7))} className="grid size-8 place-items-center rounded-lg border border-line hover:bg-surface-2">
                    <ChevronLeft className="size-4" />
                  </button>
                  <div>
                    <p className="font-semibold">
                      {formatDate(dates[0], { day: 'numeric', month: 'short' })} – {formatDate(dates[6], { day: 'numeric', month: 'short' })}
                    </p>
                    <p className="text-xs text-muted">{idx >= 0 ? `Week ${idx + 1} of ${block.weeks}` : 'Outside this block'}</p>
                  </div>
                  <button type="button" aria-label="Next week" onClick={() => go(addDays(start, 7))} className="grid size-8 place-items-center rounded-lg border border-line hover:bg-surface-2">
                    <ChevronRight className="size-4" />
                  </button>
                  {week && <KindPill week={week} />}
                </div>
                {week && <WeekKindPicker block={block} week={week} />}
              </div>
              {week && (
                <p className="mb-2 text-sm text-muted">
                  {kindDef(week.kind).hint} · volume {Math.round(week.volume * 100)}%{week.notes.length ? ` · ${week.notes.join(' · ')}` : ''}
                </p>
              )}
              <ul className="divide-y divide-line">
                {days.map((d) => (
                  <DayRow key={d.date} day={d} restDay={block.restDay != null && new Date(`${d.date}T12:00`).getDay() === block.restDay} />
                ))}
              </ul>
            </Card>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Planned" value={(plannedSec / 3600).toFixed(1)} unit="h" />
              <StatTile label="Done" value={`${done}/${weekPlanned.length}`} />
              <StatTile label="Work" value={work.hours ? String(Math.round(work.hours * 10) / 10) : '0'} unit="h" />
              <StatTile label="Key sessions" value={String(weekPlanned.filter((p) => p.intensity === 'key').length)} />
            </div>
            <Card title="Keep it current">
              <p className="text-sm text-muted">The plan re-fits itself when you change shifts, races or this block. Re-plan by hand after adding library workouts.</p>
              <button type="button" onClick={doReplan} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2">
                <RefreshCw className="size-4" /> Re-plan from today
              </button>
              {message && <p className="mt-3 text-sm">{message}</p>}
            </Card>
            {sideCards}
            {blocks.length > 0 && (
              <div className="flex justify-end">{newButton}</div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function WorkSummary() {
  const { commitments, prefs } = usePlan()
  const { settings } = useSettings()
  const start = weekStart(todayIso(), settings.weekStartsOn)
  const rows = [0, 1].map((i) => {
    const s = addDays(start, i * 7)
    const loads = weekDates(s).map((d) => dayLoad(d, commitments, prefs))
    return { label: i ? 'Next week' : 'This week', ...weekWork(loads), hard: loads.filter((l) => l.strain === 'high').length, shifts: loads.filter((l) => l.workMin).length }
  })
  if (!commitments.some((c) => c.date >= start)) {
    return <p className="text-sm text-muted">No shifts added. Add them by hand, from a calendar file or from Google Calendar, and hard sessions go on your lighter days.</p>
  }
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center justify-between gap-3">
          <span className="font-medium">{r.label}</span>
          <span className="tabular text-muted">
            {r.shifts} shift{r.shifts === 1 ? '' : 's'} · {Math.round(r.hours * 10) / 10}h{r.hard ? ` · ${r.hard} hard day${r.hard === 1 ? '' : 's'}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}
