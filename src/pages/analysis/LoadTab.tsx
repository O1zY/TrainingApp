import { CircleCheck, TrendingDown, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { ChartCard, ColumnChart, Legend, LineChart, type ChartSeries } from '../../components/charts'
import { Card } from '../../components/ui'
import { RATIO_LABEL, groupsPresent, loadSeries, monotony, ratioBand, weeklyTotals, type RatioBand } from '../../analysis/load'
import type { Range } from '../../analysis/series'
import type { Session, Wellbeing } from '../../log/types'
import { wellnessScore } from '../../log/stats'
import type { Commitment } from '../../plan/types'
import { dayTitle, fmtHours, fmtInt, weekLabel, weekTitle } from './shared'

const RATIO_ICON: Record<RatioBand, { icon: typeof CircleCheck; className: string }> = {
  low: { icon: TrendingDown, className: 'text-muted' },
  steady: { icon: CircleCheck, className: 'text-hit' },
  high: { icon: TriangleAlert, className: 'text-over' },
  spike: { icon: TriangleAlert, className: 'text-miss' },
}

function Tile({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tracking-tight">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-muted">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  )
}

export default function LoadTab({ sessions, wellbeing, commitments, range }: { sessions: Session[]; wellbeing: Wellbeing[]; commitments: Commitment[]; range: Range }) {
  const days = loadSeries(sessions, range.from, range.to)
  const weeks = weeklyTotals(sessions, commitments, range.weeks)
  const last7 = days.slice(-7).reduce((a, d) => a + d.load, 0)
  const last28 = days.slice(-28).reduce((a, d) => a + d.load, 0) / 4
  const latest = days.at(-1)
  const band = latest?.ratio != null ? ratioBand(latest.ratio) : undefined
  const mono = monotony(days)
  const present = groupsPresent(weeks)

  if (!sessions.length) {
    return <Card><p className="text-sm text-muted">No sessions logged in this range yet. Load, volume and trends build up as you log.</p></Card>
  }

  const volumeSeries: ChartSeries[] = present.map((g) => ({ key: g.key, label: g.label, color: g.color }))
  const loadSeriesDef: ChartSeries[] = [
    { key: 'acute', label: '7-day average', color: 'var(--accent)' },
    { key: 'chronic', label: '28-day average', color: 'var(--muted)' },
  ]
  const dailyBars: ChartSeries = { key: 'load', label: 'Day’s load', color: 'var(--chart-muted)', mark: 'rect' }
  const workSeries: ChartSeries[] = [
    { key: 'training', label: 'Training', color: 'var(--accent)' },
    { key: 'work', label: 'Work', color: 'var(--chart-other)' },
  ]
  const hasWork = weeks.some((w) => w.workLoad)
  const scores = wellbeing
    .filter((w) => w.date >= range.from && w.date <= range.to)
    .map((w) => ({ date: w.date, score: wellnessScore(w), sleep: w.sleepHours }))
    .filter((w) => w.score != null)
    .sort((a, b) => a.date.localeCompare(b.date))

  const Icon = band ? RATIO_ICON[band].icon : undefined

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Last 7 days" value={fmtInt(last7)} unit="load" sub={last28 ? `${last7 >= last28 ? '+' : '−'}${fmtInt(Math.abs(last7 - last28))} on your 4-week average` : undefined} />
        <Tile label="4-week average" value={fmtInt(last28)} unit="/ week" />
        <Tile
          label="Load ratio (7 ÷ 28 day)"
          value={latest?.ratio != null ? latest.ratio.toFixed(2) : '—'}
          sub={
            band && Icon ? (
              <span className="flex items-center gap-1">
                <Icon className={`size-3.5 ${RATIO_ICON[band].className}`} />
                <span className="font-medium text-text">{RATIO_LABEL[band].label}</span>
              </span>
            ) : (
              'Needs 4 weeks of history'
            )
          }
        />
        <Tile label="Monotony (last 7 days)" value={mono.monotony != null ? mono.monotony.toFixed(1) : '—'} sub={mono.monotony != null ? (mono.monotony > 2 ? 'Same every day: vary hard and easy' : 'Good hard/easy variety') : 'Needs varied days'} />
      </div>
      {band && <p className="-mt-2 text-xs text-muted">{RATIO_LABEL[band].hint}. The ratio is a guide only: research on it is mixed.</p>}

      <ChartCard
        title="Weekly training time"
        subtitle="Hours per week, by sport"
        legend={<Legend series={volumeSeries} />}
        table={{
          columns: ['Week', ...present.map((g) => g.label), 'Total'],
          rows: weeks.map((w) => [weekLabel(w.start), ...present.map((g) => fmtHours((w.sec[g.key] ?? 0) / 3600)), fmtHours(Object.values(w.sec).reduce((a, b) => a + (b ?? 0), 0) / 3600)]),
        }}
      >
        <ColumnChart
          label="Weekly training hours by sport"
          series={volumeSeries}
          format={fmtHours}
          data={weeks.map((w) => ({ label: weekLabel(w.start), title: weekTitle(w.start), values: Object.fromEntries(present.map((g) => [g.key, (w.sec[g.key] ?? 0) / 3600])) }))}
        />
      </ChartCard>

      <ChartCard
        title="Training load"
        subtitle="Session RPE × minutes per day, with 7- and 28-day weighted averages"
        legend={<Legend series={[...loadSeriesDef, dailyBars]} kind="line" />}
        table={{
          columns: ['Day', 'Load', '7-day avg', '28-day avg', 'Ratio'],
          rows: [...days].reverse().map((d) => [dayTitle(d.date), fmtInt(d.load), fmtInt(d.acute), fmtInt(d.chronic), d.ratio != null ? d.ratio.toFixed(2) : '—']),
        }}
      >
        <LineChart
          label="Daily training load with 7- and 28-day averages"
          series={loadSeriesDef}
          bars={dailyBars}
          format={fmtInt}
          data={days.map((d) => ({ label: weekLabel(d.date), title: dayTitle(d.date), values: { load: d.load, acute: d.acute, chronic: d.chronic } }))}
        />
      </ChartCard>

      {hasWork && (
        <ChartCard
          title="Training and work"
          subtitle="Weekly load from training and from your shifts, in the same units"
          legend={<Legend series={workSeries} />}
          table={{
            columns: ['Week', 'Training load', 'Work load', 'Work hours'],
            rows: weeks.map((w) => [weekLabel(w.start), fmtInt(w.load), fmtInt(w.workLoad), fmtHours(w.workHours)]),
          }}
        >
          <ColumnChart
            label="Weekly training load and work load"
            series={workSeries}
            format={fmtInt}
            data={weeks.map((w) => ({ label: weekLabel(w.start), title: weekTitle(w.start), values: { training: w.load, work: w.workLoad } }))}
          />
        </ChartCard>
      )}

      {scores.length >= 3 && (
        <ChartCard
          title="Daily check-in"
          subtitle="Wellbeing score, 1 (poor) to 5 (great)"
          table={{ columns: ['Day', 'Score', 'Sleep'], rows: [...scores].reverse().map((s) => [dayTitle(s.date), s.score!.toFixed(1), s.sleep != null ? `${s.sleep}h` : '—']) }}
        >
          <LineChart
            label="Daily wellbeing score"
            series={[{ key: 'score', label: 'Wellbeing', color: 'var(--chart-recovery)' }]}
            format={(v) => v.toFixed(1)}
            zero={false}
            data={scores.map((s) => ({ label: weekLabel(s.date), title: dayTitle(s.date), values: { score: s.score } }))}
          />
        </ChartCard>
      )}

      {!present.length && <p className="text-sm text-muted">No timed sessions in this range.</p>}
    </div>
  )
}
