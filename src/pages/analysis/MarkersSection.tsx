import { Link } from 'react-router-dom'
import { Card } from '../../components/ui'
import { formatDate } from '../../log/format'
import { useLog } from '../../log/LogStore'
import type { Marker, MarkerKind } from '../../log/types'
import { MARKERS, describeChange, formatMarker, isDue, markerDef, markerHistory } from '../../markers/markers'
import { blockEnd } from '../../plan/planned'
import { usePlan } from '../../plan/PlanStore'
import { useSettings } from '../../settings/SettingsContext'

const W = 320
const H = 96
const PAD = { l: 4, r: 4, t: 10, b: 18 }

/** Results over time, drawn so up is always fitter. Tests are filled dots, estimates hollow. */
function MarkerChart({ kind, hist }: { kind: MarkerKind; hist: Marker[] }) {
  const { settings } = useSettings()
  const up = markerDef(kind).higherIsBetter
  const t = (m: Marker) => new Date(m.date).getTime()
  const [t0, t1] = [t(hist[0]), t(hist.at(-1)!)]
  const vals = hist.map((m) => m.value)
  const [lo, hi] = [Math.min(...vals), Math.max(...vals)]
  const span = hi - lo || Math.max(1, hi * 0.02)
  const x = (m: Marker) => PAD.l + (t1 === t0 ? (W - PAD.l - PAD.r) / 2 : ((t(m) - t0) / (t1 - t0)) * (W - PAD.l - PAD.r))
  const y = (v: number) => {
    const f = (v - lo) / span
    return PAD.t + (up ? 1 - f : f) * (H - PAD.t - PAD.b)
  }
  const label = (m: Marker) => formatDate(m.date, { day: 'numeric', month: 'short' })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full overflow-visible" role="img" aria-label={`${markerDef(kind).label} over time`}>
      <polyline points={hist.map((m) => `${x(m)},${y(m.value)}`).join(' ')} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" />
      {hist.map((m) => (
        <circle key={m.id} cx={x(m)} cy={y(m.value)} r={3.5} strokeWidth={2} className={m.source === 'estimate' ? 'fill-surface stroke-accent' : 'fill-accent stroke-accent'}>
          <title>
            {label(m)}: {formatMarker(kind, m.value, settings.units)}
          </title>
        </circle>
      ))}
      <text x={PAD.l} y={H - 2} className="fill-muted text-[10px]">
        {label(hist[0])}
      </text>
      {hist.length > 1 && (
        <text x={W - PAD.r} y={H - 2} textAnchor="end" className="fill-muted text-[10px]">
          {label(hist.at(-1)!)}
        </text>
      )}
    </svg>
  )
}

/** Each fitness marker over time, and the change since the current block began. */
export function MarkersSection({ today }: { today: string }) {
  const { markers } = useLog()
  const { blocks } = usePlan()
  const { settings } = useSettings()
  const block = blocks.find((b) => b.start <= today && blockEnd(b) >= today)
  const kinds = MARKERS.filter((d) => d.sport && markers.some((m) => m.kind === d.kind))

  if (!kinds.length) {
    return (
      <Card title="Fitness markers">
        <p className="text-sm text-muted">
          No threshold numbers yet. <Link to="/log/markers" className="font-medium text-accent-strong">Add a run threshold, FTP, 2k or CSS</Link> and this shows them over time, the plainest sign
          the training is working.
        </p>
      </Card>
    )
  }

  return (
    <Card title="Fitness markers" action={<Link to="/log/markers" className="text-sm font-medium text-accent-strong">All markers</Link>}>
      <div className="grid gap-5 sm:grid-cols-2">
        {kinds.map((d) => {
          const hist = markerHistory(markers, d.kind)
          const cur = hist.at(-1)!
          // Compared with the value in force when the block started, or the first one.
          const base = (block && hist.filter((m) => m.date <= block.start).at(-1)) || hist[0]
          const change = base !== cur ? describeChange(d.kind, base.value, cur.value, settings.units) : undefined
          return (
            <div key={d.kind}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">{d.label}</p>
                <p className="tabular font-display text-lg font-bold">{formatMarker(d.kind, cur.value, settings.units)}</p>
              </div>
              <p className="text-xs text-muted">
                {change ? (
                  <span className={change.better ? 'font-medium text-hit' : ''}>
                    {change.text} since {block && base.date <= block.start ? 'this block began' : formatDate(base.date, { day: 'numeric', month: 'short' })}
                  </span>
                ) : (
                  `${hist.length} result${hist.length === 1 ? '' : 's'}`
                )}
                {isDue(cur, today, settings.retestWeeks) && <span className="ml-2 font-medium text-accent-strong">Re-test due</span>}
              </p>
              <MarkerChart kind={d.kind} hist={hist} />
            </div>
          )
        })}
      </div>
    </Card>
  )
}
