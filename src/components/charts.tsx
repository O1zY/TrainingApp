import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Card, Segmented } from './ui'

// Small SVG charts for the analysis pages. Rendered at the container's real width
// so text stays its normal size. Specs: bars ≤ 24px with a 4px rounded top, a 2px
// surface gap between touching fills, 2px lines, ≥ 8px dots with a surface ring,
// hairline grid, one y-axis. Every chart has a hover/focus readout and a table view.

export interface ChartSeries {
  key: string
  label: string
  /** CSS colour, normally a --chart-* token. */
  color: string
  /** Legend key shape, mirroring the mark; defaults to the legend's kind. */
  mark?: 'line' | 'rect'
}

export interface ChartPoint {
  /** Axis label. */
  label: string
  /** Tooltip heading. */
  title: string
  values: Record<string, number | undefined>
}

const MARGIN = { top: 10, right: 12, bottom: 24, left: 44 }
const AXIS_TEXT = 'fill-muted text-[11px]'

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Round tick values covering min–max: steps of 1, 2, 2.5 or 5 × 10ⁿ. */
function niceTicks(min: number, max: number, count = 4) {
  if (max <= min) max = min + 1
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = lo; v <= hi + step / 1e6; v += step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}

/** Show every nth x label so they never collide. */
const labelEvery = (n: number, plotW: number) => Math.max(1, Math.ceil((n * 44) / Math.max(plotW, 1)))

/** A bar with a rounded data end and a square baseline. */
function barPath(x: number, y: number, w: number, h: number, round: boolean) {
  if (h <= 0) return ''
  const r = round ? Math.min(4, w / 2, h) : 0
  return `M${x},${y + h}V${y + r}q0,-${r} ${r},-${r}h${w - 2 * r}q${r},0 ${r},${r}V${y + h}Z`
}

function Tooltip({ x, width, title, rows, total }: { x: number; width: number; title: string; rows: { label: string; value: string; color: string; dashed?: boolean }[]; total?: string }) {
  const left = Math.min(Math.max(x - 90, 0), Math.max(width - 180, 0))
  return (
    <div className="pointer-events-none absolute top-0 z-10 w-44 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg" style={{ left }}>
      <p className="mb-1 font-medium text-muted">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2">
          <span className="h-0.5 w-3 shrink-0 rounded" style={{ background: r.color }} />
          <span className="tabular font-semibold text-text">{r.value}</span>
          <span className="truncate text-muted">{r.label}</span>
        </p>
      ))}
      {total && <p className="mt-1 border-t border-line pt-1 text-muted">Total <span className="tabular font-semibold text-text">{total}</span></p>}
    </div>
  )
}

export function Legend({ series, kind = 'rect' }: { series: ChartSeries[]; kind?: 'rect' | 'line' }) {
  if (series.length < 2) return null
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          {(s.mark ?? kind) === 'rect' ? <span className="size-2.5 rounded-sm" style={{ background: s.color }} /> : <span className="h-0.5 w-3.5 rounded" style={{ background: s.color }} />}
          {s.label}
        </span>
      ))}
    </div>
  )
}

/** Keyboard: arrows move the readout along the x axis. */
function stepKeys(e: KeyboardEvent, n: number, i: number | undefined, set: (i: number) => void) {
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    const next = (i ?? n - 1) + (e.key === 'ArrowRight' ? 1 : -1)
    set(Math.max(0, Math.min(n - 1, next)))
  }
}

export function ColumnChart({
  data,
  series,
  mode = 'stack',
  height = 200,
  format,
  label,
}: {
  data: ChartPoint[]
  series: ChartSeries[]
  mode?: 'stack' | 'group'
  height?: number
  format: (v: number) => string
  /** Accessible summary of the chart. */
  label: string
}) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<number>()
  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const plotH = height - MARGIN.top - MARGIN.bottom
  const totals = data.map((d) => series.reduce((a, s) => a + (d.values[s.key] ?? 0), 0))
  const max = mode === 'stack' ? Math.max(0, ...totals) : Math.max(0, ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0)))
  const ticks = niceTicks(0, max || 1)
  const top = ticks.at(-1)!
  const y = (v: number) => MARGIN.top + plotH - (v / top) * plotH
  const band = data.length ? plotW / data.length : 0
  const every = labelEvery(data.length, plotW)
  const groupW = Math.min(12, (band * 0.7) / series.length)
  const stackW = Math.min(24, band * 0.6)

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(undefined)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
              <text x={MARGIN.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className={`tabular ${AXIS_TEXT}`}>
                {format(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = MARGIN.left + band * i + band / 2
            const dim = hover != null && hover !== i
            let marks: ReactNode
            if (mode === 'stack') {
              let cum = 0
              const parts = series.filter((s) => (d.values[s.key] ?? 0) > 0)
              marks = parts.map((s, j) => {
                const v = d.values[s.key]!
                const y0 = y(cum)
                cum += v
                const y1 = y(cum)
                // 2px surface gap above each segment that has another on top.
                const h = y0 - y1 - (j < parts.length - 1 ? 2 : 0)
                return <path key={s.key} d={barPath(cx - stackW / 2, y0 - h, stackW, h, j === parts.length - 1)} fill={s.color} />
              })
            } else {
              const total = groupW * series.length + 2 * (series.length - 1)
              marks = series.map((s, j) => {
                const v = d.values[s.key] ?? 0
                const x = cx - total / 2 + j * (groupW + 2)
                return <path key={s.key} d={barPath(x, y(v), groupW, y(0) - y(v), true)} fill={s.color} />
              })
            }
            return (
              <g key={i} opacity={dim ? 0.45 : 1}>
                {marks}
                <rect
                  x={MARGIN.left + band * i}
                  y={MARGIN.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.title}: ${series.map((s) => `${s.label} ${format(d.values[s.key] ?? 0)}`).join(', ')}`}
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(undefined)}
                  onKeyDown={(e) => stepKeys(e, data.length, hover, setHover)}
                  className="outline-none"
                />
                {i % every === (data.length - 1) % every && (
                  <text x={cx} y={height - 6} textAnchor="middle" className={AXIS_TEXT}>
                    {d.label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}
      {hover != null && data[hover] && (
        <Tooltip
          x={MARGIN.left + band * hover + band / 2}
          width={width}
          title={data[hover].title}
          rows={series
            .filter((s) => mode === 'group' || data[hover].values[s.key])
            .map((s) => ({ label: s.label, value: format(data[hover].values[s.key] ?? 0), color: s.color }))
            .reverse()}
          total={mode === 'stack' && series.length > 1 ? format(totals[hover]) : undefined}
        />
      )}
    </div>
  )
}

export function LineChart({
  data,
  series,
  bars,
  height = 200,
  format,
  label,
  invert = false,
  zero = true,
  gaps = true,
}: {
  data: ChartPoint[]
  series: ChartSeries[]
  /** Context columns behind the lines, in the same units (one axis). */
  bars?: ChartSeries
  height?: number
  format: (v: number) => string
  label: string
  /** Lower is better (pace): smaller values sit higher. */
  invert?: boolean
  /** Start the axis at zero; off for pace and 1RM, where the range is what matters. */
  zero?: boolean
  /** Break a line where a point has no value (a week off); off to join across other series' points. */
  gaps?: boolean
}) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<number>()
  const margin = { ...MARGIN, right: 52 }
  const plotW = Math.max(0, width - margin.left - margin.right)
  const plotH = height - margin.top - margin.bottom
  const keys = [...series.map((s) => s.key), ...(bars ? [bars.key] : [])]
  const vals = data.flatMap((d) => keys.map((k) => d.values[k])).filter((v): v is number => v != null)
  const lo = vals.length ? Math.min(...vals) : 0
  const hi = vals.length ? Math.max(...vals) : 1
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1
  const ticks = niceTicks(zero ? 0 : lo - pad, hi + (zero ? 0 : pad))
  const [t0, t1] = [ticks[0], ticks.at(-1)!]
  const y = (v: number) => {
    const f = (v - t0) / (t1 - t0 || 1)
    return margin.top + (invert ? f : 1 - f) * plotH
  }
  const step = data.length > 1 ? plotW / (data.length - 1) : 0
  const x = (i: number) => margin.left + (data.length > 1 ? i * step : plotW / 2)
  const every = labelEvery(data.length, plotW)
  const showDots = data.length <= 16
  const band = data.length ? plotW / data.length : 0

  const path = (key: string) => {
    let d = ''
    let pen = false
    data.forEach((p, i) => {
      const v = p.values[key]
      if (v == null) return void (pen = pen && !gaps)
      d += `${pen ? 'L' : 'M'}${x(i)},${y(v)}`
      pen = true
    })
    return d
  }

  const pick = (clientX: number, el: SVGSVGElement) => {
    const rx = clientX - el.getBoundingClientRect().left
    setHover(Math.max(0, Math.min(data.length - 1, Math.round((rx - margin.left) / (step || 1)))))
  }

  // End labels: last value of each line, dropped when two would collide.
  const ends = series
    .map((s) => {
      const i = data.findLastIndex((d) => d.values[s.key] != null)
      return i < 0 ? undefined : { s, i, v: data[i].values[s.key]!, py: y(data[i].values[s.key]!) }
    })
    .filter((e): e is NonNullable<typeof e> => !!e)
    .sort((a, b) => a.py - b.py)
    .filter((e, j, arr) => j === 0 || e.py - arr[j - 1].py >= 13)

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(undefined)}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          tabIndex={0}
          className="block outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
          onFocus={() => setHover((h) => h ?? data.length - 1)}
          onBlur={() => setHover(undefined)}
          onKeyDown={(e) => stepKeys(e, data.length, hover, setHover)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={margin.left} x2={width - margin.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
              <text x={margin.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className={`tabular ${AXIS_TEXT}`}>
                {format(t)}
              </text>
            </g>
          ))}
          {bars &&
            data.map((d, i) => {
              const v = d.values[bars.key]
              if (!v) return null
              const w = Math.max(1, Math.min(24, band - 2))
              return <path key={i} d={barPath(x(i) - w / 2, y(v), w, y(t0) - y(v), w >= 6)} fill={bars.color} />
            })}
          {series.map((s) => (
            <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {showDots &&
            series.map((s) =>
              data.map((d, i) =>
                d.values[s.key] == null ? null : <circle key={`${s.key}${i}`} cx={x(i)} cy={y(d.values[s.key]!)} r={4} fill={s.color} className="stroke-surface" strokeWidth={2} />,
              ),
            )}
          {ends.map((e) => (
            <g key={e.s.key}>
              {!showDots && <circle cx={x(e.i)} cy={e.py} r={4} fill={e.s.color} className="stroke-surface" strokeWidth={2} />}
              <text x={x(e.i) + 8} y={e.py} dy="0.32em" className="tabular fill-text text-[11px] font-semibold">
                {format(e.v)}
              </text>
            </g>
          ))}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={margin.top} y2={margin.top + plotH} className="stroke-muted" strokeWidth={1} />
              {series.map((s) =>
                data[hover].values[s.key] == null ? null : (
                  <circle key={s.key} cx={x(hover)} cy={y(data[hover].values[s.key]!)} r={5} fill={s.color} className="stroke-surface" strokeWidth={2} />
                ),
              )}
            </g>
          )}
          {data.map((d, i) =>
            i % every === (data.length - 1) % every ? (
              <text key={i} x={x(i)} y={height - 6} textAnchor="middle" className={AXIS_TEXT}>
                {d.label}
              </text>
            ) : null,
          )}
        </svg>
      )}
      {hover != null && data[hover] && (
        <Tooltip
          x={x(hover)}
          width={width}
          title={data[hover].title}
          rows={[...series, ...(bars ? [bars] : [])]
            .filter((s) => data[hover].values[s.key] != null)
            .map((s) => ({ label: s.label, value: format(data[hover].values[s.key]!), color: s.color }))}
        />
      )}
    </div>
  )
}

export interface TableData {
  columns: string[]
  rows: (string | number)[][]
}

/** A chart card with a Chart / Table switch, so no value is only reachable by hovering. */
export function ChartCard({ title, subtitle, legend, table, children, action }: { title: string; subtitle?: string; legend?: ReactNode; table: TableData; children: ReactNode; action?: ReactNode }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          <Segmented<'chart' | 'table'>
            value={view}
            onChange={setView}
            options={[
              { value: 'chart', label: 'Chart' },
              { value: 'table', label: 'Table' },
            ]}
          />
        </div>
      </div>
      {view === 'chart' ? (
        <>
          {legend}
          {children}
        </>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
              <tr>
                {table.columns.map((c, i) => (
                  <th key={c} className={`py-1.5 pr-3 font-medium ${i ? 'text-right' : ''}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className={`tabular py-1.5 pr-3 ${j ? 'text-right' : ''}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
