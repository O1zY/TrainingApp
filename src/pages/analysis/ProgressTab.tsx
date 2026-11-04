import { ArrowDownRight, ArrowUpRight, Minus, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ChartCard, Legend, LineChart, type ChartSeries } from '../../components/charts'
import { Card } from '../../components/ui'
import { aerobicTrend, benchmarks, liftTrends, personalBests, type Benchmark, type Pb } from '../../analysis/records'
import { groupOf, type Group, type Range } from '../../analysis/series'
import { PACE_LABEL, formatDate, formatDistance, formatPace, formatTime, formatWeight, paceKind, paceValue, weightUnit } from '../../log/format'
import type { OneRepMax, Session, Sport, Workout } from '../../log/types'
import { SPORTS } from '../../log/sports'
import { useSettings, type Units } from '../../settings/SettingsContext'
import { dayTitle, weekLabel, weekTitle } from './shared'

const SPORT_COLOR: Partial<Record<Sport, string>> = {
  erg: 'var(--chart-row)',
  row: 'var(--chart-row)',
  run: 'var(--chart-run)',
  bike: 'var(--chart-bike)',
  swim: 'var(--chart-swim)',
  strength: 'var(--chart-strength)',
}

function pbValue(pb: Pb, units: Units) {
  const { def, best } = pb
  if (def.distanceM) return formatTime(best.value)
  const unit = def.sport === 'erg' ? 'm' : units === 'metric' ? 'km' : 'mi'
  return `${formatDistance(best.value, unit)}${unit}`
}

function pbPace(pb: Pb, units: Units) {
  const kind = paceKind(pb.def.sport, units)
  if (!kind) return ''
  const [dist, sec] = pb.def.distanceM ? [pb.def.distanceM, pb.best.value] : [pb.best.value, pb.def.durationSec!]
  return `${formatPace(kind, paceValue(kind, dist, sec))}${PACE_LABEL[kind]}`
}

function Records({ pbs, from }: { pbs: Pb[]; from: string }) {
  const { settings } = useSettings()
  const sports = [...new Set(pbs.map((p) => p.def.sport))]
  return (
    <Card title="Personal bests">
      {pbs.length ? (
        <div className="space-y-5">
          {sports.map((sport) => (
            <div key={sport}>
              <h3 className="mb-1 text-sm font-semibold">{SPORTS[sport].label}</h3>
              <ul className="divide-y divide-line">
                {pbs
                  .filter((p) => p.def.sport === sport)
                  .map((p) => {
                    const prev = p.progression.at(-2)
                    const isNew = p.best.date >= from
                    return (
                      <li key={p.def.id}>
                        <Link to={`/log/session/${p.best.sessionId}`} className="-mx-2 grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                          <span className="text-sm text-muted">{p.def.label}</span>
                          <span className="min-w-0">
                            <span className="tabular font-semibold">{pbValue(p, settings.units)}</span>
                            <span className="tabular ml-2 text-xs text-muted">{pbPace(p, settings.units)}</span>
                            {prev && (
                              <span className="block text-xs text-muted">
                                Was {p.def.distanceM ? formatTime(prev.value) : formatDistance(prev.value, 'm') + 'm'} on {formatDate(prev.date, { day: 'numeric', month: 'short', year: '2-digit' })}
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-muted">
                            {isNew && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent-strong">
                                <Trophy className="size-3" /> New
                              </span>
                            )}
                            {formatDate(p.best.date, { day: 'numeric', month: 'short', year: '2-digit' })}
                            {p.best.rep && ` · rep ${p.best.rep}`}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No standard distances logged yet: 2k, 5k, 10k and so on, as whole sessions or reps. They’ll show here with how they’ve improved.</p>
      )}
    </Card>
  )
}

function attemptFormat(b: Benchmark, units: Units) {
  if (b.metric === 'pace') return (v: number) => formatPace(b.kind!, v)
  if (b.metric === 'volume') return (v: number) => `${formatWeight(v, units)}${weightUnit(units)}`
  if (b.metric === 'time') return (v: number) => formatTime(v, false)
  return (v: number) => `${Math.round(v * 10) / 10}`
}

const METRIC_LABEL = { pace: 'Average pace', volume: 'Volume lifted', time: 'Time', rounds: 'Rounds' }

function BenchmarkCard({ b }: { b: Benchmark }) {
  const { settings } = useSettings()
  const fmt = attemptFormat(b, settings.units)
  const first = b.attempts[0].value
  const last = b.attempts.at(-1)!.value
  const better = b.lowerBetter ? last < first : last > first
  const same = Math.abs(last - first) < 1e-9
  const Arrow = same ? Minus : better ? ArrowUpRight : ArrowDownRight
  const unit = b.metric === 'pace' ? PACE_LABEL[b.kind!] : ''
  return (
    <ChartCard
      title={b.workout.name}
      subtitle={`${METRIC_LABEL[b.metric]}${unit ? ` (${unit})` : ''} · ${b.attempts.length} attempts${b.lowerBetter ? ' · faster is higher' : ''}`}
      action={
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${same ? 'text-muted' : better ? 'text-hit' : 'text-miss'}`}>
          <Arrow className="size-3.5" />
          {same ? 'No change' : better ? 'Better' : 'Worse'}
        </span>
      }
      table={{
        columns: ['Date', METRIC_LABEL[b.metric], 'Avg HR'],
        rows: [...b.attempts].reverse().map((a) => [formatDate(a.date, { day: 'numeric', month: 'short', year: '2-digit' }), `${fmt(a.value)}${unit}`, a.hr ? Math.round(a.hr) : '—']),
      }}
    >
      <LineChart
        label={`${b.workout.name}: ${METRIC_LABEL[b.metric].toLowerCase()} per attempt`}
        height={160}
        series={[{ key: 'v', label: METRIC_LABEL[b.metric], color: SPORT_COLOR[b.workout.sport] ?? 'var(--chart-other)' }]}
        format={fmt}
        invert={b.lowerBetter}
        zero={false}
        data={b.attempts.map((a) => ({ label: formatDate(a.date, { day: 'numeric', month: 'short' }), title: dayTitle(a.date), values: { v: a.value } }))}
      />
      <Link to={`/library/${b.workout.id}`} className="mt-2 inline-block text-xs font-medium text-accent-strong">
        Open in library
      </Link>
    </ChartCard>
  )
}

export default function ProgressTab({ sessions, maxes, workouts, range, group }: { sessions: Session[]; maxes: OneRepMax[]; workouts: Workout[]; range: Range; group?: Group }) {
  const { settings } = useSettings()
  const wu = weightUnit(settings.units)
  // Tested maxes are their own series: joined to the estimates, a cautious test reads as a drop.
  const liftSeries: ChartSeries[] = [
    { key: 'est', label: 'Estimated', color: 'var(--chart-strength)' },
    { key: 'tested', label: 'Tested', color: 'var(--muted)' },
  ]
  // Records look at all history (a PB is a PB); "New" marks the ones set in this range.
  const pbs = personalBests(sessions).filter((p) => !group || groupOf(p.def.sport) === group)
  const inRange = sessions.filter((s) => s.date >= range.from && s.date <= range.to)
  const marks = benchmarks(inRange, workouts, settings.units)
  const lifts = !group || group === 'strength' ? liftTrends(inRange, maxes.filter((m) => m.date >= range.from)) : []
  const aerobic = (['erg', 'run', 'bike', 'swim', 'row'] as Sport[])
    .filter((s) => !group || groupOf(s) === group)
    .map((sport) => ({ sport, trend: aerobicTrend(inRange, sport, range.weeks, settings.units) }))
    .filter((a) => a.trend)

  return (
    <div className="space-y-5">
      <Records pbs={pbs} from={range.from} />

      <section>
        <h2 className="mb-1 font-semibold">Repeat sessions</h2>
        <p className="mb-3 text-sm text-muted">Library workouts you’ve done at least twice in this range, attempt by attempt. Set benchmarks in a plan block to repeat them every cycle.</p>
        {marks.length ? (
          <div className="grid gap-5 lg:grid-cols-2">
            {marks.map((b) => (
              <BenchmarkCard key={b.workout.id} b={b} />
            ))}
          </div>
        ) : (
          <Card>
            <p className="text-sm text-muted">Nothing repeated yet in this range. Log the same library workout twice to compare, or widen the range.</p>
          </Card>
        )}
      </section>

      {aerobic.length > 0 && (
        <section>
          <h2 className="mb-1 font-semibold">Easy pace</h2>
          <p className="mb-3 text-sm text-muted">Weekly average pace of steady and easy sessions. Getting faster at the same heart rate means the aerobic base is growing.</p>
          <div className="grid gap-5 lg:grid-cols-2">
            {aerobic.map(({ sport, trend }) => {
              const kind = trend!.kind
              return (
                <ChartCard
                  key={sport}
                  title={SPORTS[sport].label}
                  subtitle={`Average ${PACE_LABEL[kind]} on easy sessions · faster is higher`}
                  table={{
                    columns: ['Week', `Pace ${PACE_LABEL[kind]}`, 'Avg HR', 'Sessions'],
                    rows: trend!.weeks
                      .filter((w) => w.sessions)
                      .reverse()
                      .map((w) => [weekLabel(w.start), formatPace(kind, w.pace), w.hr ? Math.round(w.hr) : '—', w.sessions]),
                  }}
                >
                  <LineChart
                    label={`${SPORTS[sport].label} easy pace per week`}
                    height={160}
                    series={[{ key: 'pace', label: 'Easy pace', color: SPORT_COLOR[sport]! }]}
                    format={(v) => formatPace(kind, v)}
                    invert={kind !== 'speedKmh' && kind !== 'speedMph'}
                    zero={false}
                    data={trend!.weeks.map((w) => ({ label: weekLabel(w.start), title: weekTitle(w.start), values: { pace: w.pace } }))}
                  />
                </ChartCard>
              )
            })}
          </div>
        </section>
      )}

      {lifts.length > 0 && (
        <section>
          <h2 className="mb-1 font-semibold">Strength</h2>
          <p className="mb-3 text-sm text-muted">Best estimated 1RM per session (Epley, sets of 12 or fewer), plus tested maxes.</p>
          <div className="grid gap-5 lg:grid-cols-2">
            {lifts.slice(0, 6).map((l) => (
              <ChartCard
                key={l.name}
                title={l.name}
                subtitle={`1RM (${wu})`}
                legend={l.points.some((p) => p.tested) ? <Legend series={liftSeries} kind="line" /> : undefined}
                table={{
                  columns: ['Date', `1RM (${wu})`, 'Source'],
                  rows: [...l.points].reverse().map((p) => [formatDate(p.date, { day: 'numeric', month: 'short', year: '2-digit' }), formatWeight(p.kg, settings.units), p.tested ? 'Tested' : 'Estimated']),
                }}
              >
                <LineChart
                  label={`${l.name} estimated 1RM over time`}
                  height={160}
                  series={l.points.some((p) => p.tested) ? liftSeries : liftSeries.slice(0, 1)}
                  format={(v) => formatWeight(v, settings.units)}
                  zero={false}
                  gaps={false}
                  data={l.points.map((p) => ({ label: formatDate(p.date, { day: 'numeric', month: 'short' }), title: `${dayTitle(p.date)}${p.tested ? ' · tested' : ''}`, values: p.tested ? { tested: p.kg } : { est: p.kg } }))}
                />
              </ChartCard>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
