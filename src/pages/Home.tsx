import { Flag, HeartPulse } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, StatTile } from '../components/ui'
import { formatTime, todayIso } from '../log/format'
import { useLog } from '../log/LogStore'
import { SPORTS } from '../log/sports'
import { sessionLoad } from '../log/stats'
import { Feed } from './log/Feed'
import { CommitmentLine, PlannedRow } from './plan/bits'
import { daysBetween } from '../plan/dates'
import { raceLabel } from '../plan/events'
import { loggedFor } from '../plan/planned'
import { usePlan } from '../plan/PlanStore'
import { useSettings } from '../settings/SettingsContext'

function greeting(d: Date) {
  const h = d.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function weekDays(today: Date, weekStartsOn: 0 | 1) {
  const start = new Date(today)
  start.setDate(today.getDate() - ((today.getDay() - weekStartsOn + 7) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

export default function Home() {
  const { settings } = useSettings()
  const today = new Date()
  const days = weekDays(today, settings.weekStartsOn)
  const distUnit = settings.units === 'metric' ? 'km' : 'mi'
  const { sessions, wellbeing } = useLog()
  const weekIsos = days.map((d) => todayIso(d))
  const week = sessions.filter((s) => weekIsos.includes(s.date) && s.status === 'completed' && s.sport !== 'transition')
  const weekSec = week.reduce((a, s) => a + (s.durationSec ?? 0), 0)
  const weekDist = week.reduce((a, s) => a + (s.distanceM ?? 0), 0) / (settings.units === 'metric' ? 1000 : 1609.344)
  const weekLoad = week.reduce((a, s) => a + (sessionLoad(s) ?? 0), 0)
  const checkedIn = wellbeing.some((w) => w.date === todayIso(today))
  const { planned, commitments, events } = usePlan()
  const todayPlanned = planned.filter((p) => p.date === todayIso(today))
  const todayWork = commitments.filter((c) => c.date === todayIso(today))
  const nextRace = events.find((e) => e.kind === 'race' && e.date >= todayIso(today))
  const toGo = nextRace ? daysBetween(todayIso(today), nextRace.date) : 0

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">
          {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight md:text-3xl">{greeting(today)}, Ollie</h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Today" className="lg:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              {todayWork.map((c) => (
                <CommitmentLine key={c.id} c={c} />
              ))}
              {todayPlanned.length ? (
                todayPlanned.map((p) => <PlannedRow key={p.id} p={p} />)
              ) : (
                <div>
                  <p className="font-semibold">Nothing planned</p>
                  <p className="text-sm text-muted">{planned.length ? 'A rest day in your plan.' : 'Sessions from your training block will show here.'}</p>
                </div>
              )}
              {!checkedIn && (
                <Link to={`/log/wellbeing/${todayIso(today)}/edit`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong">
                  <HeartPulse className="size-4" /> Do today’s check-in
                </Link>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Link to="/log" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:opacity-90">
                Log session
              </Link>
              <Link to="/plan" className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-2">
                Plan
              </Link>
            </div>
          </div>
        </Card>

        <Card title="Next event">
          {nextRace ? (
            <Link to="/plan/events" className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-phase-race/15 text-phase-race">
                <Flag className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{nextRace.name}</p>
                <p className="text-sm text-muted">{[toGo === 0 ? 'Today' : `${toGo} day${toGo === 1 ? '' : 's'} to go`, raceLabel(nextRace)].filter(Boolean).join(' · ')}</p>
              </div>
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-muted">
                <Flag className="size-5" />
              </span>
              <div>
                <p className="font-semibold">No races yet</p>
                <p className="text-sm text-muted">
                  <Link to="/plan/events/new" className="font-medium text-accent-strong">Add target races</Link> in Plan.
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card title="This week" action={<Link to="/plan" className="text-sm font-medium text-accent-strong">Open plan</Link>}>
        <div className="grid grid-cols-7 gap-1.5 md:gap-3">
          {days.map((d) => {
            const isToday = sameDay(d, today)
            const daySessions = week.filter((s) => s.date === todayIso(d))
            const dayPlanned = planned.filter((p) => p.date === todayIso(d) && !p.skipped && !loggedFor(p, sessions))
            return (
              <div
                key={d.toISOString()}
                className={`flex flex-col items-center rounded-xl py-2.5 md:py-4 ${isToday ? 'bg-accent-soft' : 'bg-surface-2'}`}
              >
                <span className={`text-[11px] font-medium uppercase ${isToday ? 'text-accent-strong' : 'text-muted'}`}>
                  {d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 3)}
                </span>
                <span className={`tabular mt-0.5 text-lg font-bold ${isToday ? 'text-accent-strong' : ''}`}>{d.getDate()}</span>
                <span className="mt-1.5 flex h-1.5 flex-wrap justify-center gap-0.5">
                  {daySessions.slice(0, 4).map((s) => (
                    <span key={s.id} title={SPORTS[s.sport].label} className={`size-1.5 rounded-full ${SPORTS[s.sport].bg}`} />
                  ))}
                  {dayPlanned.slice(0, 4 - Math.min(4, daySessions.length)).map((p) => (
                    <span key={p.id} title={`Planned: ${p.title}`} className={`size-1.5 rounded-full border ${SPORTS[p.sport].text} border-current`} />
                  ))}
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
        <StatTile label="Time this week" value={weekSec ? formatTime(weekSec, false).replace(/:\d\d$/, '') : '0:00'} unit="h" />
        <StatTile label="Distance" value={weekDist ? weekDist.toFixed(1) : '0'} unit={distUnit} />
        <StatTile label="Sessions" value={String(week.length)} />
        <StatTile label="Training load" value={weekLoad ? String(weekLoad) : '—'} />
      </div>

      <Card title="Recent activity" action={<Link to="/log" className="text-sm font-medium text-accent-strong">All history</Link>}>
        <Feed limitDays={5} />
      </Card>
    </div>
  )
}
