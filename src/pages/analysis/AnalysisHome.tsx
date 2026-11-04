import { ChartLine, Trophy } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarLineChart, BarStrip, LegendKey, Sparkline, StackedColumns } from '../../components/charts'
import { chip } from '../../components/styles'
import { Card, EmptyState, PageHeader, Segmented, StatTile } from '../../components/ui'
import { FATIGUE_DAYS, FITNESS_DAYS, RATIO_LABEL, counted, loadSeries, missingRpe, ratioBand, type RatioBand } from '../../analysis/load'
import { distancePbs, liftPbs } from '../../analysis/pbs'
import { BAND_LABEL, DRIVER_LABEL, METRICS, MIN_PAIRS, bandCuts, byBand, describe, links, pairUp, type MetricKey, type Strength } from '../../analysis/wellbeing'
import { adherence, weekStarts, weeklyBySport, type VolumeMetric } from '../../analysis/weekly'
import { PACE_LABEL, distanceFactor, formatDate, formatPace, formatTime, formatWeight, paceKind, paceValue, todayIso, weightUnit } from '../../log/format'
import { useLog } from '../../log/LogStore'
import { SPORTS } from '../../log/sports'
import type { Sport } from '../../log/types'
import { addDays, weekStart } from '../../plan/dates'
import { usePlan } from '../../plan/PlanStore'
import { useSettings } from '../../settings/SettingsContext'

type Range = '4w' | '12w' | '26w' | '52w'
const RANGES: { value: Range; label: string; weeks: number }[] = [
  { value: '4w', label: '4w', weeks: 4 },
  { value: '12w', label: '12w', weeks: 12 },
  { value: '26w', label: '6m', weeks: 26 },
  { value: '52w', label: '1y', weeks: 52 },
]

/** Order sports appear in per-sport views: the same everywhere so a sport never moves. */
const SPORT_ORDER: Sport[] = ['erg', 'row', 'run', 'bike', 'swim', 'strength', 'recovery', 'other']

const BAND_STYLE: Record<RatioBand, string> = {
  low: 'bg-surface-2 text-muted',
  good: 'bg-hit/15 text-hit',
  caution: 'bg-over/15 text-over',
  high: 'bg-miss/15 text-miss',
}

const hours = (sec: number) => (sec >= 36000 ? `${Math.round(sec / 3600)}h` : sec >= 3600 ? `${(sec / 3600).toFixed(1)}h` : `${Math.round(sec / 60)}′`)
const shortDate = (iso: string) => formatDate(iso, { day: 'numeric', month: 'short' })

export default function AnalysisHome() {
  const { sessions } = useLog()
  const { planned } = usePlan()
  const { settings } = useSettings()
  const [range, setRange] = useState<Range>('12w')
  const [metric, setMetric] = useState<VolumeMetric>('time')

  const today = todayIso()
  const weeksBack = RANGES.find((r) => r.value === range)!.weeks
  const weeks = weekStarts(addDays(today, -(weeksBack * 7 - 1)), today, settings.weekStartsOn).slice(-weeksBack)
  const from = weeks[0]

  if (!sessions.some(counted)) {
    return (
      <>
        <PageHeader title="Analysis" subtitle="Load, progress and personal bests" />
        <EmptyState icon={ChartLine} title="Nothing to analyse yet" body="Log a few sessions with an RPE and this page fills in: training load, planned vs done, weekly trends per sport and your PBs.">
          <Link to="/log" className="mt-5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:brightness-110">
            Log a session
          </Link>
        </EmptyState>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Analysis" subtitle="Load, progress and personal bests" action={<Segmented value={range} options={RANGES} onChange={setRange} />} />
      <div className="space-y-5">
        <LoadSection from={from} today={today} />
        <WellbeingSection from={from} today={today} />
        <AdherenceSection weeks={weeks} today={today} hasPlan={planned.length > 0} />
        <TrendsSection weeks={weeks} metric={metric} setMetric={setMetric} />
        <PbSection />
      </div>
    </>
  )
}

function LoadSection({ from, today }: { from: string; today: string }) {
  const { sessions } = useLog()
  const series = loadSeries(sessions, today)
  const shown = series.filter((d) => d.date >= from)
  const now = series[series.length - 1]
  const noRpe = missingRpe(sessions, from, today)
  if (!now) {
    return (
      <Card title="Training load">
        <p className="text-sm text-muted">Load is RPE × minutes. Add an RPE to your sessions to see fitness, fatigue and form.</p>
      </Card>
    )
  }
  const ratio = now.fitness > 0 ? now.fatigue / now.fitness : undefined
  const band = ratio != null ? ratioBand(ratio) : undefined
  const form = now.fitness - now.fatigue
  const weekLoad = series.slice(-7).reduce((a, d) => a + d.load, 0)

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
        <StatTile label={`Fitness (${FITNESS_DAYS}-day)`} value={String(Math.round(now.fitness))} />
        <StatTile label={`Fatigue (${FATIGUE_DAYS}-day)`} value={String(Math.round(now.fatigue))} />
        <StatTile label="Form" value={`${form > 0 ? '+' : ''}${Math.round(form)}`} />
        <div className="rounded-[20px] border border-line/70 bg-surface p-4 md:p-5">
          <div className="text-xs font-medium text-muted">Acute : chronic</div>
          <div className="tabular font-display mt-2 text-3xl font-bold tracking-tight">{ratio != null ? ratio.toFixed(2) : '—'}</div>
          {band && <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${BAND_STYLE[band]}`}>{RATIO_LABEL[band]}</span>}
        </div>
      </div>

      <Card title="Training load" action={<span className="tabular text-sm text-muted">{Math.round(weekLoad)} in the last 7 days</span>}>
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <LegendKey kind="bar" className="bg-muted/60" label="Daily load" />
          <LegendKey kind="line" className="bg-accent" label="Fitness" />
          <LegendKey kind="line" className="bg-contrast" label="Fatigue" />
        </div>
        <BarLineChart
          points={shown.map((d) => ({ label: shortDate(d.date), bar: d.load, lines: [d.fitness, d.fatigue] }))}
          bar={{ label: 'load', className: 'fill-muted bg-muted/60' }}
          lines={[
            { label: 'fitness', stroke: 'var(--accent)', className: 'bg-accent' },
            { label: 'fatigue', stroke: 'var(--contrast)', className: 'bg-contrast' },
          ]}
        />
        <p className="mt-3 text-xs text-muted">
          Load is RPE × minutes. Fitness and fatigue are {FITNESS_DAYS}- and {FATIGUE_DAYS}-day weighted averages of it; form is fitness minus fatigue (negative while
          building, positive when fresh). An acute:chronic ratio of 0.8–1.3 is the usual sweet spot; above 1.5 is a spike.
          {noRpe > 0 && ` ${noRpe} session${noRpe === 1 ? '' : 's'} in this range ha${noRpe === 1 ? 's' : 've'} no RPE, so add${noRpe === 1 ? 's' : ''} no load.`}
        </p>
      </Card>
    </>
  )
}

const STRENGTH_LABEL: Record<Strength, string> = { none: 'No link', weak: 'Weak', moderate: 'Moderate', strong: 'Strong' }

function WellbeingSection({ from, today }: { from: string; today: string }) {
  const { sessions, wellbeing } = useLog()
  const [pick, setPick] = useState<MetricKey>()
  const series = loadSeries(sessions, today)
  const pairs = pairUp(wellbeing, series, from, today)
  const checkIns = wellbeing.filter((w) => w.date >= from && w.date <= today).length

  if (pairs.length < MIN_PAIRS) {
    return (
      <Card title="Wellbeing vs load">
        <p className="text-sm text-muted">
          Once there are {MIN_PAIRS}+ <Link to={`/log/wellbeing/${today}/edit`} className="font-medium text-accent-strong">daily check-ins</Link> in this range alongside
          sessions with an RPE, this shows which of sleep, HRV, soreness, mood and the rest move with your training load.{' '}
          {checkIns > 0 && `${pairs.length} of ${MIN_PAIRS} so far.`}
        </p>
      </Card>
    )
  }

  const found = links(pairs).filter((l) => l.strength !== 'none')
  const shownMetrics = METRICS.filter((m) => pairs.some((p) => m.get(p.w) != null))
  const metric = shownMetrics.find((m) => m.key === pick) ?? shownMetrics.find((m) => m.key === 'wellness') ?? shownMetrics[0]
  const cuts = bandCuts(series.filter((d) => d.date >= addDays(from, -1) && d.date < today).map((d) => d.load))
  const rows = cuts && metric ? byBand(pairs, metric, cuts) : []
  const isScale = metric && !['sleepHours', 'restingHr', 'hrv'].includes(metric.key)
  const top = isScale ? 5 : Math.max(1, ...rows.map((r) => r.mean ?? 0)) * 1.1

  return (
    <Card title="Wellbeing vs load" action={<span className="tabular text-sm text-muted">{pairs.length} check-ins</span>}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">What goes together</h3>
      {found.length === 0 ? (
        <p className="text-sm text-muted">Nothing stands out yet: none of your check-in scores move much with load. That can change as more days come in.</p>
      ) : (
        <ul className="space-y-1.5">
          {found.slice(0, 6).map((l) => (
            <li key={`${l.metric.key}-${l.driver}`} className="flex items-start gap-3 rounded-xl px-2 py-1.5">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${l.goodWithLoad ? 'bg-hit' : 'bg-over'}`} aria-hidden />
              <span className="min-w-0 flex-1 text-sm">
                {describe(l)}
                <span className="block text-xs text-muted">
                  {l.goodWithLoad ? 'Good sign' : 'Worth watching'} · {DRIVER_LABEL[l.driver]} · {STRENGTH_LABEL[l.strength]} (r = {l.r.toFixed(2)}, {l.n} days)
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {metric && cuts && (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">The morning after</h3>
          <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
            {shownMetrics.map((m) => (
              <button key={m.key} type="button" className={chip(m.key === metric.key)} onClick={() => setPick(m.key)}>
                {m.label}
              </button>
            ))}
          </div>
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.band} className="grid grid-cols-[5.5rem_1fr_6.5rem] items-center gap-3 text-sm">
                <span className="font-medium">{BAND_LABEL[r.band]}</span>
                <span className="h-3 overflow-hidden rounded-full bg-surface-2">
                  {r.mean != null && <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (r.mean / top) * 100)}%` }} />}
                </span>
                <span className="tabular text-right">
                  {r.mean != null ? <span className="font-semibold">{metric.format(r.mean)}</span> : <span className="text-muted">—</span>}
                  <span className="text-xs text-muted"> · {r.n}d</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Average {metric.label.toLowerCase()} ({metric.better} is better) on mornings after each kind of day. Light, moderate and hard are thirds of your own training days in
            this range: up to {Math.round(cuts[0])}, up to {Math.round(cuts[1])} and above {Math.round(cuts[1])} load.
          </p>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">
        Each check-in is set against the load before it: the day before, and the {FATIGUE_DAYS}-day weighted load to the day before. Links use rank correlation (r from −1 to 1;
        below 0.2 is left out) and show what tends to go together, not what causes what.
      </p>
    </Card>
  )
}

function AdherenceSection({ weeks, today, hasPlan }: { weeks: string[]; today: string; hasPlan: boolean }) {
  const { sessions } = useLog()
  const { planned } = usePlan()
  const { settings } = useSettings()
  if (!hasPlan) {
    return (
      <Card title="Planned vs done">
        <p className="text-sm text-muted">
          Once you have a <Link to="/plan" className="font-medium text-accent-strong">training block</Link>, this shows how much of it you got done each week.
        </p>
      </Card>
    )
  }
  const { rows, byIntensity, missed } = adherence(planned, sessions, weeks, settings.weekStartsOn, today)
  const due = rows.reduce((a, r) => a + r.planned, 0)
  const done = rows.reduce((a, r) => a + r.done, 0)
  const skipped = rows.reduce((a, r) => a + r.skipped, 0)
  const extra = rows.reduce((a, r) => a + r.extra, 0)
  const plannedSec = rows.reduce((a, r) => a + r.plannedSec, 0)
  const doneSec = rows.reduce((a, r) => a + r.doneSec, 0)
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—')

  return (
    <Card title="Planned vs done">
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure label="Sessions done" value={pct(done, due)} sub={`${done} of ${due} due`} />
        <Figure label="Key sessions done" value={pct(byIntensity.key.done + byIntensity.race.done, byIntensity.key.due + byIntensity.race.due)} sub={`${byIntensity.key.done + byIntensity.race.done} of ${byIntensity.key.due + byIntensity.race.due}`} />
        <Figure label="Planned time done" value={pct(doneSec, plannedSec)} sub={`${hours(doneSec)} of ${hours(plannedSec)}`} />
        <Figure label="Off-plan sessions" value={String(extra)} sub={skipped ? `${skipped} skipped on purpose` : 'not counting recovery'} />
      </div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <LegendKey kind="bar" className="bg-hit" label="Done" />
        <LegendKey kind="bar" className="bg-over" label="Skipped" />
        <LegendKey kind="bar" className="bg-miss" label="Missed" />
      </div>
      <StackedColumns
        columns={rows.map((r) => ({
          label: shortDate(r.start),
          title: `Week of ${shortDate(r.start)}`,
          segments: [
            { label: 'done', value: r.done, className: 'bg-hit' },
            { label: 'skipped', value: r.skipped, className: 'bg-over' },
            { label: 'missed', value: r.missed, className: 'bg-miss' },
          ],
          note: r.extra ? <span>+{r.extra} off plan</span> : undefined,
        }))}
        caption={() => 'Hover or tab to a week for its numbers.'}
      />
      {missed.length > 0 && (
        <div className="mt-4 border-t border-line pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Recently missed</h3>
          <ul className="space-y-1">
            {missed.slice(0, 5).map((p) => {
              const def = SPORTS[p.sport]
              return (
                <li key={p.id}>
                  <Link to={`/plan/session/${p.id}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                    <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${def.soft} ${def.text}`}>
                      <def.icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.title}</span>
                    <span className="shrink-0 text-xs text-muted">{formatDate(p.date)}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Card>
  )
}

function Figure({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="tabular font-display mt-1 text-2xl font-bold tracking-tight">{value}</div>
      <div className="tabular text-xs text-muted">{sub}</div>
    </div>
  )
}

function TrendsSection({ weeks, metric, setMetric }: { weeks: string[]; metric: VolumeMetric; setMetric: (m: VolumeMetric) => void }) {
  const { sessions } = useLog()
  const { settings } = useSettings()
  const bySport = weeklyBySport(sessions, weeks, settings.weekStartsOn, metric)
  const rows = SPORT_ORDER.filter((s) => bySport.get(s)?.some((v) => v > 0))
  const labels = weeks.map((w) => `w/c ${shortDate(w)}`)
  const longUnit = settings.units === 'metric' ? 'km' : 'mi'
  const fmt = (sport: Sport) => (v: number) => {
    if (metric === 'time') return hours(v)
    if (metric === 'load') return String(Math.round(v))
    if (sport === 'row' || sport === 'erg' || sport === 'swim') return `${Math.round(v).toLocaleString('en-GB')}m`
    return `${(v / distanceFactor(longUnit)).toFixed(1)}${longUnit}`
  }

  return (
    <Card
      title="Weekly volume by sport"
      action={
        <Segmented
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'time', label: 'Time' },
            { value: 'distance', label: 'Distance' },
            { value: 'load', label: 'Load' },
          ]}
        />
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing logged with {metric === 'distance' ? 'a distance' : metric === 'load' ? 'an RPE' : 'a duration'} in this range.</p>
      ) : (
        <div className="divide-y divide-line">
          {rows.map((sport) => {
            const values = bySport.get(sport)!
            const def = SPORTS[sport]
            const total = values.reduce((a, b) => a + b, 0)
            const half = Math.floor(values.length / 2)
            const recent = values.slice(half).reduce((a, b) => a + b, 0)
            const earlier = values.slice(0, values.length - half).reduce((a, b) => a + b, 0)
            const change = earlier > 0 && values.length >= 4 ? Math.round(((recent - earlier) / earlier) * 100) : undefined
            return (
              <div key={sport} className="grid grid-cols-[7.5rem_1fr] items-start gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[9rem_1fr_6rem]">
                <div className="flex items-center gap-2 pt-1">
                  <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${def.soft} ${def.text}`}>
                    <def.icon className="size-4" />
                  </span>
                  <span className="truncate text-sm font-medium">{def.label}</span>
                </div>
                <BarStrip values={values} labels={labels} className={def.bg} format={fmt(sport)} />
                <div className="col-start-2 -mt-2 flex items-baseline gap-2 sm:col-start-auto sm:mt-0 sm:block sm:pt-1 sm:text-right">
                  <div className="tabular text-sm font-semibold">{fmt(sport)(total)}</div>
                  {change != null && (
                    <div className="tabular text-xs text-muted" title="Second half of the range vs the first half">
                      {change > 0 ? '↑' : change < 0 ? '↓' : '→'} {Math.abs(change)}%
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <PaceTrends weeks={weeks} />
    </Card>
  )
}

/** Average pace per week for the moving sports, so steady improvement shows up. */
function PaceTrends({ weeks }: { weeks: string[] }) {
  const { sessions } = useLog()
  const { settings } = useSettings()
  const rows = (['erg', 'run', 'bike', 'swim', 'row'] as Sport[])
    .map((sport) => {
      const kind = paceKind(sport, settings.units)!
      const index = new Map(weeks.map((w, i) => [w, i]))
      const dist = weeks.map(() => 0)
      const sec = weeks.map(() => 0)
      for (const s of sessions) {
        if (!counted(s) || s.sport !== sport || !s.distanceM || !s.durationSec) continue
        const i = index.get(weekStart(s.date, settings.weekStartsOn))
        if (i == null) continue
        dist[i] += s.distanceM
        sec[i] += s.durationSec
      }
      const paces = weeks.map((_, i) => paceValue(kind, dist[i], sec[i])).filter((v): v is number => v != null)
      return { sport, kind, paces }
    })
    .filter((r) => r.paces.length >= 2)
  if (!rows.length) return null
  return (
    <div className="mt-5 border-t border-line pt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Average pace, week by week</h3>
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(({ sport, kind, paces }) => {
          const speed = kind === 'speedKmh' || kind === 'speedMph'
          const first = paces[0]
          const last = paces[paces.length - 1]
          // Plot "better" as up: speeds as they are, paces negated.
          return (
            <li key={sport} className="flex items-center gap-3">
              <span className="w-20 truncate text-sm font-medium">{SPORTS[sport].label}</span>
              <Sparkline values={paces.map((p) => (speed ? p : -p))} className={`${SPORTS[sport].text} stroke-current`} />
              <span className="tabular text-xs text-muted">
                {formatPace(kind, first)} → <span className="font-semibold text-text">{formatPace(kind, last)}</span>
                {PACE_LABEL[kind]}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">All sessions with a distance and time, so easy weeks read slower. Up is faster.</p>
    </div>
  )
}

function PbSection() {
  const { sessions } = useLog()
  const { settings } = useSettings()
  const [sport, setSport] = useState<Sport | 'strength' | 'all'>('all')
  const endurance = distancePbs(sessions)
  const lifts = liftPbs(sessions)
  const sports = SPORT_ORDER.filter((s) => endurance.some((p) => p.sport === s) || (s === 'strength' && lifts.length))
  const recent = addDays(todayIso(), -28)

  if (!endurance.length && !lifts.length) {
    return (
      <Card title="Personal bests">
        <p className="text-sm text-muted">PBs appear once you log a standard distance (e.g. a 2k erg or a 5k run, as a session or a piece) or lifts with weight and reps.</p>
      </Card>
    )
  }

  return (
    <Card title="Personal bests">
      {sports.length > 1 && (
        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
          <button type="button" className={chip(sport === 'all')} onClick={() => setSport('all')}>
            All
          </button>
          {sports.map((s) => (
            <button key={s} type="button" className={chip(sport === s)} onClick={() => setSport(s)}>
              {SPORTS[s].label}
            </button>
          ))}
        </div>
      )}

      {sport !== 'strength' && endurance.some((p) => sport === 'all' || p.sport === sport) && (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {endurance
            .filter((p) => sport === 'all' || p.sport === sport)
            .map((p) => {
              const def = SPORTS[p.sport]
              const kind = paceKind(p.sport, settings.units)!
              const isNew = p.date >= recent && p.attempts > 1
              return (
                <li key={`${p.sport}-${p.dist.m}`}>
                  <Link to={`/log/session/${p.sessionId}`} className="flex items-center gap-3 rounded-2xl border border-line/70 px-3 py-2.5 hover:bg-surface-2">
                    <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${def.soft} ${def.text}`}>
                      <def.icon className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        {def.label} · {p.dist.label}
                        {isNew && <span className="rounded-full bg-accent-soft px-1.5 font-semibold text-accent-strong">New</span>}
                      </span>
                      <span className="tabular font-display block text-xl font-bold tracking-tight">{formatTime(p.sec)}</span>
                      <span className="tabular block truncate text-xs text-muted">
                        {formatPace(kind, paceValue(kind, p.dist.m, p.sec))}
                        {PACE_LABEL[kind]} · {shortDate(p.date)}
                        {p.piece != null && ` · piece ${p.piece + 1}`}
                        {p.previousSec != null && ` · ${formatTime(p.previousSec - p.sec)} quicker`}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
        </ul>
      )}

      {(sport === 'all' || sport === 'strength') && lifts.length > 0 && (
        <div className={sport === 'all' && endurance.length ? 'mt-5 border-t border-line pt-4' : ''}>
          {sport === 'all' && endurance.length > 0 && <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Lifts</h3>}
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-2 py-1.5 font-medium">Lift</th>
                  <th className="px-2 py-1.5 text-right font-medium">Est. 1RM</th>
                  <th className="px-2 py-1.5 text-right font-medium">Heaviest</th>
                  <th className="px-2 py-1.5 font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {lifts.map((l) => (
                  <tr key={l.exercise} className="border-t border-line">
                    <td className="px-2 py-2">
                      <Link to={`/log/session/${l.sessionId}`} className="font-medium hover:text-accent-strong">
                        {l.exercise}
                      </Link>
                    </td>
                    <td className="tabular px-2 py-2 text-right">
                      {l.e1rm != null ? (
                        <>
                          <span className="font-semibold">{formatWeight(l.e1rm, settings.units)}</span>
                          <span className="text-muted">{weightUnit(settings.units)}</span>
                          <span className="block text-xs text-muted">{shortDate(l.e1rmDate!)}</span>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="tabular px-2 py-2 text-right">
                      {l.topKg != null ? (
                        <>
                          <span className="font-semibold">{formatWeight(l.topKg, settings.units)}</span>
                          <span className="text-muted">{weightUnit(settings.units)}</span>
                          <span className="block text-xs text-muted">{shortDate(l.topDate!)}</span>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <Sparkline values={l.history.map((h) => h.e1rm)} className="stroke-sport-strength" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">Estimated 1RM uses the Epley formula on working sets of 12 reps or fewer.</p>
        </div>
      )}
      {sport !== 'strength' && sport !== 'all' && !endurance.some((p) => p.sport === sport) && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Trophy className="size-4" /> No standard distances logged yet.
        </p>
      )}
    </Card>
  )
}
