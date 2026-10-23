import { Flag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SessionCard } from '../components/SessionCard'
import { Card, StatTile } from '../components/ui'
import { SAMPLE_SESSIONS } from '../sessions/sampleSessions'
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
            <div>
              <p className="font-semibold">Nothing planned</p>
              <p className="text-sm text-muted">Planned sessions from your programme will show here.</p>
            </div>
            <div className="flex gap-2">
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
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-muted">
              <Flag className="size-5" />
            </span>
            <div>
              <p className="font-semibold">No races yet</p>
              <p className="text-sm text-muted">Add target races in Plan.</p>
            </div>
          </div>
        </Card>
      </div>

      <Card title="This week" action={<Link to="/plan" className="text-sm font-medium text-accent-strong">Open plan</Link>}>
        <div className="grid grid-cols-7 gap-1.5 md:gap-3">
          {days.map((d) => {
            const isToday = sameDay(d, today)
            return (
              <div
                key={d.toISOString()}
                className={`flex flex-col items-center rounded-xl py-2.5 md:py-4 ${isToday ? 'bg-accent-soft' : 'bg-surface-2'}`}
              >
                <span className={`text-[11px] font-medium uppercase ${isToday ? 'text-accent-strong' : 'text-muted'}`}>
                  {d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 3)}
                </span>
                <span className={`tabular mt-0.5 text-lg font-bold ${isToday ? 'text-accent-strong' : ''}`}>{d.getDate()}</span>
                {/* Session dots go here once logging exists. */}
                <span className="mt-1.5 h-1.5" />
              </div>
            )
          })}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
        <StatTile label="Time this week" value="0:00" unit="h" />
        <StatTile label="Distance" value="0" unit={distUnit} />
        <StatTile label="Sessions" value="0" />
        <StatTile label="Training load" value="—" />
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Recent activity</h2>
          {/* Sample data until logging and storage exist. */}
          <span className="text-xs text-muted">Example sessions</span>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {SAMPLE_SESSIONS.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      </section>
    </div>
  )
}
