import { CalendarRange } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ChartCard, ColumnChart, Legend, type ChartSeries } from '../../components/charts'
import { Card, EmptyState } from '../../components/ui'
import { complianceByIntensity, complianceByWeek, planStatus, unplanned } from '../../analysis/compliance'
import type { Range } from '../../analysis/series'
import { formatDate } from '../../log/format'
import { SPORTS } from '../../log/sports'
import type { Session } from '../../log/types'
import { INTENSITY_LABEL } from '../../plan/generate'
import type { PlannedSession } from '../../plan/types'
import { fmtHours, fmtPct, weekLabel, weekTitle } from './shared'

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  )
}

export default function PlanTab({ planned, sessions, range, today }: { planned: PlannedSession[]; sessions: Session[]; range: Range; today: string }) {
  const inRange = planned.filter((p) => p.date >= range.from && p.date <= range.to)
  if (!inRange.length) {
    return (
      <EmptyState icon={CalendarRange} title="Nothing planned in this range" body="Build a training block in Plan and this shows how much of it you got done, week by week.">
        <Link to="/plan" className="mt-5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90">
          Open Plan
        </Link>
      </EmptyState>
    )
  }

  const weeks = complianceByWeek(planned, sessions, range.weeks, today)
  const byIntensity = complianceByIntensity(planned, sessions, range.from, today)
  const due = weeks.reduce((a, w) => a + w.planned, 0)
  const done = weeks.reduce((a, w) => a + w.done, 0)
  const missed = weeks.reduce((a, w) => a + w.missed, 0)
  const skipped = weeks.reduce((a, w) => a + w.skipped, 0)
  const plannedH = weeks.reduce((a, w) => a + w.plannedSec, 0) / 3600
  const doneH = weeks.reduce((a, w) => a + w.doneSec, 0) / 3600
  const key = byIntensity.find((r) => r.intensity === 'key')
  const extras = unplanned(sessions, range.from, range.to)
  const missedKey = inRange
    .filter((p) => p.intensity === 'key' && planStatus(p, sessions, today) === 'missed')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6)

  const series: ChartSeries[] = [
    { key: 'planned', label: 'Planned', color: 'var(--chart-muted)' },
    { key: 'done', label: 'Done', color: 'var(--accent)' },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Sessions done" value={fmtPct(done, due)} sub={`${done} of ${due} due${skipped ? ` · ${skipped} skipped` : ''}`} />
        <Tile label="Key sessions done" value={key ? fmtPct(key.done, key.planned) : '—'} sub={key ? `${key.done} of ${key.planned}` : 'None due yet'} />
        <Tile label="Hours" value={`${Math.round(doneH * 10) / 10} / ${Math.round(plannedH * 10) / 10}`} sub="Done / planned" />
        <Tile label="Missed" value={String(missed)} sub={`${extras.length} unplanned session${extras.length === 1 ? '' : 's'} logged`} />
      </div>

      <ChartCard
        title="Planned and done"
        subtitle="Hours per week, sessions due up to today"
        legend={<Legend series={series} />}
        table={{
          columns: ['Week', 'Planned', 'Done', 'Sessions done', 'Missed', 'Skipped'],
          rows: weeks.map((w) => [weekLabel(w.start), fmtHours(w.plannedSec / 3600), fmtHours(w.doneSec / 3600), `${w.done}/${w.planned}`, w.missed, w.skipped]),
        }}
      >
        <ColumnChart
          label="Planned and completed training hours per week"
          mode="group"
          series={series}
          format={fmtHours}
          data={weeks.map((w) => ({ label: weekLabel(w.start), title: `${weekTitle(w.start)} · ${w.done}/${w.planned} sessions`, values: { planned: w.plannedSec / 3600, done: w.doneSec / 3600 } }))}
        />
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="By intensity">
          <ul className="space-y-3">
            {byIntensity.map((r) => (
              <li key={r.intensity}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">{INTENSITY_LABEL[r.intensity]}</span>
                  <span className="tabular text-muted">
                    {r.done}/{r.planned} · <span className="font-semibold text-text">{fmtPct(r.done, r.planned)}</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-accent-soft" role="meter" aria-valuemin={0} aria-valuemax={r.planned} aria-valuenow={r.done} aria-label={`${INTENSITY_LABEL[r.intensity]} sessions done`}>
                  <div className="h-2 rounded-full bg-accent" style={{ width: `${(r.done / r.planned) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Missed key sessions">
          {missedKey.length ? (
            <ul className="-mx-2">
              {missedKey.map((p) => {
                const def = SPORTS[p.sport]
                return (
                  <li key={p.id}>
                    <Link to={`/plan/session/${p.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
                      <def.icon className={`size-4 shrink-0 ${def.text}`} />
                      <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
                      <span className="shrink-0 text-muted">{formatDate(p.date)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">None in this range.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
