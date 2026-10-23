import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useSettings, type Units } from '../settings/SettingsContext'
import { distance, formatClock, weight } from '../sessions/format'
import { describeReps, detailStats, formatMetric, headlineStats, INTENTS, SPORTS, STRUCTURED, type Stat } from '../sessions/fields'
import { checkHR, checkTarget, describeTarget, primaryMetric, repValue, summarise, TARGET_LABEL, zoneOf, zoneRange, type Assessment, type TargetStatus } from '../sessions/intervals'
import type { Interval, Session, TargetMetric } from '../sessions/types'

const STATUS_LABEL: Record<TargetStatus, string> = { hit: 'On target', over: 'Harder than target', under: 'Missed' }

/** Green on target, amber harder, and red that deepens the further a miss is from target. */
function colour(a: Assessment) {
  if (a.status === 'hit') return 'var(--hit)'
  if (a.status === 'over') return 'var(--over)'
  return `color-mix(in oklab, var(--miss-far) ${Math.round(a.severity * 100)}%, var(--miss-near))`
}

const title = (a: Assessment) => (a.status === 'hit' ? STATUS_LABEL.hit : `${STATUS_LABEL[a.status]} by ${(a.off * 100).toFixed(1)}%`)

/**
 * HR for one rep as a bar on a scale from 50% of max to max, with the target
 * zone shaded behind it so creep across the reps is visible at a glance.
 */
function HrBar({ rep, tops, maxHR }: { rep: Interval; tops: number[]; maxHR: number }) {
  if (rep.avgHR === undefined) return null
  const lo = maxHR * 0.5
  const pct = (bpm: number) => `${Math.max(0, Math.min(100, ((bpm - lo) / (maxHR - lo)) * 100))}%`
  const a = checkHR(rep, tops)
  const zone = rep.hrZone ? zoneRange(rep.hrZone, tops) : undefined
  return (
    <div className="mt-1.5" title={a ? `HR ${title(a).toLowerCase()} (Z${rep.hrZone})` : undefined}>
      <div className="text-center text-[10px] text-muted">
        <span className="font-semibold" style={a ? { color: colour(a) } : undefined}>
          ♥ {rep.avgHR} · Z{zoneOf(rep.avgHR, tops)}
        </span>
      </div>
      <div className="relative mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        {zone && (
          <span
            className="absolute inset-y-0 bg-text/15"
            style={{ left: pct(zone.min ?? lo), right: `calc(100% - ${pct(zone.max ?? maxHR)})` }}
          />
        )}
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(rep.avgHR), background: a ? colour(a) : 'var(--muted)' }} />
      </div>
    </div>
  )
}

function when(iso: string) {
  const d = new Date(iso)
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000)
  const day = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day} · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

function StatGrid({ stats, small }: { stats: Stat[]; small?: boolean }) {
  return (
    <dl className={`grid grid-cols-2 gap-x-4 gap-y-3 ${small ? 'sm:grid-cols-3 md:grid-cols-4' : 'sm:grid-cols-4'}`}>
      {stats.map((s) => (
        <div key={s.label}>
          <dt className="text-xs text-muted">{s.label}</dt>
          <dd className={`tabular font-semibold ${small ? 'text-sm' : 'text-lg tracking-tight'}`}>
            {s.value}
            {s.unit && <span className="ml-0.5 text-xs font-medium text-muted">{s.unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** One chip per rep, coloured by whether it hit its target. The quick-look view. */
function RepStrip({ session, units, tops, maxHR }: { session: Session; units: Units; tops: number[]; maxHR: number }) {
  const reps = session.intervals!
  const summary = summarise(session, tops)!
  const metric = primaryMetric(session)
  return (
    <div className="mt-4 rounded-xl bg-surface-2 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold">{describeReps(reps, session.sport, units)}</span>
        <span className="tabular flex gap-3 whitespace-nowrap text-xs font-semibold">
          {summary.targeted > 0 && (
            <span className={summary.hit === summary.targeted ? 'text-hit' : 'text-muted'}>
              {summary.hit}/{summary.targeted} on target
            </span>
          )}
          {summary.hrTargeted > 0 && (
            <span className={summary.hrHit === summary.hrTargeted ? 'text-hit' : 'text-muted'}>
              HR {summary.hrHit}/{summary.hrTargeted} in zone
            </span>
          )}
        </span>
      </div>
      <ol className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5">
        {reps.map((r, i) => {
          const v = repValue(r, metric)
          const a = checkTarget(r)
          return (
            <li key={i} className="tabular flex flex-col rounded-lg bg-surface px-2 py-1.5">
              <div className="text-center" title={a ? title(a) : undefined}>
                <span className="block text-[10px] font-medium text-muted">Rep {i + 1}</span>
                <span className="text-sm font-semibold" style={a ? { color: colour(a) } : undefined}>
                  {v !== undefined ? formatMetric(metric, v, session.sport, units).value : '—'}
                </span>
                {a && <span className="mx-auto mt-1 block h-1 w-6 rounded-full" style={{ background: colour(a) }} />}
              </div>
              <HrBar rep={r} tops={tops} maxHR={maxHR} />
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Full per-rep breakdown: every metric the reps have, the target, and how each rep went. */
function IntervalTable({ session, units, tops }: { session: Session; units: Units; tops: number[] }) {
  const reps = session.intervals!
  const summary = summarise(session, tops)!
  const sport = session.sport
  const hasDistance = reps.some((r) => r.distanceM)
  // Equal-distance reps already say their distance in the rep summary, so skip the column.
  const showDistance = hasDistance && reps.some((r) => r.distanceM !== reps[0].distanceM)
  const metrics = (['split', 'pace', 'power', 'hr', 'rate'] as TargetMetric[]).filter((m) => {
    if (m === 'split') return sport === 'row' && hasDistance
    if (m === 'pace') return sport === 'run' && hasDistance
    return reps.some((r) => repValue(r, m) !== undefined)
  })
  const hasTargets = reps.some((r) => r.target || r.hrZone)
  const hasRest = reps.some((r) => r.restS)
  // Units live in the header so the cells stay narrow enough for a phone.
  const fmt = (m: TargetMetric, v: number | undefined) => (v === undefined ? '—' : formatMetric(m, v, sport, units).value)
  const header = (m: TargetMetric) => {
    const { label, unit } = formatMetric(m, 0, sport, units)
    return `${label} ${unit ?? ''}`
  }

  // Averages over the work reps only, so warm-up and rests don't dilute them.
  const avg: Interval = {
    durationS: summary.workS,
    distanceM: summary.distanceM || undefined,
    avgPower: summary.avgPower,
    avgHR: summary.avgHR,
    avgRate: summary.avgRate,
  }
  const drift = summary.drift
  const primary = primaryMetric(session)

  return (
    <div>
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <table className="tabular w-full whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="py-2 pr-3 font-medium">#</th>
              <th className="py-2 pr-3 font-medium">Time</th>
              {showDistance && <th className="py-2 pr-3 font-medium">Dist</th>}
              {metrics.map((m) => (
                <th key={m} className="py-2 pr-3 font-medium">
                  {header(m)}
                </th>
              ))}
              {hasRest && <th className="py-2 pr-3 font-medium">Rest</th>}
              {hasTargets && <th className="py-2 pr-3 font-medium">Target</th>}
            </tr>
          </thead>
          <tbody>
            {reps.map((r, i) => {
              const a = checkTarget(r)
              const hr = checkHR(r, tops)
              // The target metric and HR cells carry their own colour; everything else stays neutral.
              const cellColour = (m: TargetMetric) => (m === r.target?.metric && a ? colour(a) : m === 'hr' && hr ? colour(hr) : undefined)
              return (
                <tr key={i} className="border-b border-line/60">
                  <td className="py-2 pr-3 text-muted">{i + 1}</td>
                  <td className="py-2 pr-3">{formatClock(r.durationS, sport === 'row' ? 1 : 0)}</td>
                  {showDistance && <td className="py-2 pr-3">{r.distanceM ? distanceText(r.distanceM, units, sport) : '—'}</td>}
                  {metrics.map((m) => (
                    <td
                      key={m}
                      className={`py-2 pr-3 ${cellColour(m) ? 'font-semibold' : ''}`}
                      style={{ color: cellColour(m) }}
                      title={m === r.target?.metric && a ? title(a) : m === 'hr' && hr ? title(hr) : undefined}
                    >
                      {fmt(m, repValue(r, m))}
                    </td>
                  ))}
                  {hasRest && <td className="py-2 pr-3 text-muted">{r.restS ? formatClock(r.restS) : '—'}</td>}
                  {hasTargets && (
                    <td className="py-2 pr-3 text-muted">
                      {[r.target && describeTarget(r.target, (v) => fmt(r.target!.metric, v)), r.hrZone && `HR Z${r.hrZone}`]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                  )}
                </tr>
              )
            })}
            <tr className="font-semibold">
              <td className="py-2 pr-3 text-muted">Avg</td>
              <td className="py-2 pr-3">{formatClock(summary.workS / summary.reps, sport === 'row' ? 1 : 0)}</td>
              {showDistance && <td className="py-2 pr-3" />}
              {metrics.map((m) => (
                <td key={m} className="py-2 pr-3">
                  {fmt(m, repValue(avg, m))}
                </td>
              ))}
              {hasRest && <td className="py-2 pr-3" />}
              {hasTargets && <td className="py-2 pr-3" />}
            </tr>
          </tbody>
        </table>
      </div>
      {drift !== undefined && (
        <p className="mt-2 text-xs text-muted">
          Last rep {Math.abs(drift) < 0.005 ? 'matched' : drift > 0 ? `${(drift * 100).toFixed(1)}% harder than` : `${(-drift * 100).toFixed(1)}% easier than`} the first on{' '}
          {TARGET_LABEL[primary].toLowerCase()}.
        </p>
      )}
    </div>
  )
}

function StrengthDetail({ session, units }: { session: Session; units: Units }) {
  if (session.sport !== 'strength') return null
  return (
    <div className="space-y-3">
      {session.wod && (
        <div className="rounded-xl bg-surface-2 p-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {session.wod.format === 'for-time' ? 'For time' : session.wod.format.toUpperCase()}
            {session.wod.timeCapS ? ` · ${formatClock(session.wod.timeCapS)} cap` : ''}
          </p>
          <p className="mt-1">{session.wod.description}</p>
          <p className="tabular mt-1 font-semibold">{session.wod.result}</p>
        </div>
      )}
      {session.exercises?.map((e) => (
        <div key={e.name} className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
          <span className="font-medium">{e.name}</span>
          <span className="tabular text-muted">
            {e.sets.map((s) => (s.weightKg ? `${s.reps} × ${weightText(s.weightKg, units)}` : `${s.reps}`)).join(' · ')}
          </span>
        </div>
      ))}
    </div>
  )
}

function distanceText(m: number, units: Units, sport: Session['sport']) {
  const d = distance(m, units, sport)
  return `${d.value}${d.unit}`
}

function weightText(kg: number, units: Units) {
  const w = weight(kg, units)
  return `${w.value}${w.unit}`
}

export function SessionCard({ session, defaultOpen = false }: { session: Session; defaultOpen?: boolean }) {
  const { settings } = useSettings()
  const [open, setOpen] = useState(defaultOpen)
  const sport = SPORTS[session.sport]
  const Icon = sport.icon
  const structured = STRUCTURED.includes(session.intent) && !!session.intervals?.length
  const sub = [when(session.start), session.sport === 'row' ? (session.environment === 'erg' ? 'Erg' : 'Water') : sport.label, INTENTS[session.intent]]

  return (
    <article className="min-w-0 rounded-2xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="block w-full p-4 text-left md:p-5"
      >
        <div className="flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 ${sport.text}`}>
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">{session.title}</h3>
            <p className="truncate text-xs text-muted">{sub.join(' · ')}</p>
          </div>
          <ChevronDown className={`mt-1 size-5 shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
        </div>
        <div className="mt-4">
          <StatGrid stats={headlineStats(session, settings.units)} />
        </div>
        {structured && <RepStrip session={session} units={settings.units} tops={settings.hrZoneTops} maxHR={settings.maxHR} />}
      </button>

      {open && (
        <div className="space-y-5 border-t border-line px-4 pb-5 pt-4 md:px-5">
          {structured && (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Intervals</h4>
              <IntervalTable session={session} units={settings.units} tops={settings.hrZoneTops} />
            </section>
          )}
          {session.sport === 'strength' && (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Workout</h4>
              <StrengthDetail session={session} units={settings.units} />
            </section>
          )}
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Session</h4>
            <StatGrid stats={detailStats(session, settings.units)} small />
          </section>
          {session.notes && (
            <section>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Notes</h4>
              <p className="text-sm">{session.notes}</p>
            </section>
          )}
        </div>
      )}
    </article>
  )
}
