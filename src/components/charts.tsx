// Small hand-rolled SVG/HTML charts. Colours come from the tokens in index.css; text stays in
// text tokens and colour only marks identity. Every chart has a hover/focus readout, and the
// numbers it shows are also in a table or label nearby.

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** "Nice" round tick values from 0 up to at least max. */
function ticks(max: number, count = 3) {
  if (max <= 0) return [0]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step)
}

export function LegendKey({ kind, className, label }: { kind: 'line' | 'bar'; className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {kind === 'line' ? <span className={`h-0.5 w-3.5 rounded-full ${className}`} /> : <span className={`size-2.5 rounded-[3px] ${className}`} />}
      {label}
    </span>
  )
}

export interface LinePoint {
  label: string
  bar: number
  lines: number[]
}

/**
 * Bars (e.g. daily load) under one or more lines (e.g. fitness and fatigue), all on one
 * axis. A crosshair snaps to the nearest day and the readout lists every series.
 */
export function BarLineChart({
  points,
  bar,
  lines,
  height = 220,
  format = (v: number) => String(Math.round(v)),
}: {
  points: LinePoint[]
  bar: { label: string; className: string }
  lines: { label: string; stroke: string; className: string }[]
  height?: number
  format?: (v: number) => string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number>()
  const padL = 34
  const padB = 22
  const padT = 8
  const plotW = Math.max(0, width - padL)
  const plotH = height - padB - padT
  const max = Math.max(1, ...points.flatMap((p) => [p.bar, ...p.lines]))
  const yt = ticks(max)
  const top = yt[yt.length - 1]
  const n = points.length
  const step = n ? plotW / n : 0
  const x = (i: number) => padL + step * i + step / 2
  const y = (v: number) => padT + plotH - (v / top) * plotH
  const barW = Math.max(1, Math.min(14, step - 2))
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 64))))

  const pick = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect()
    const i = Math.floor((clientX - rect.left - padL) / step)
    setHover(i >= 0 && i < n ? i : undefined)
  }
  const h = hover != null ? points[hover] : undefined

  return (
    <div ref={ref} className="relative select-none">
      {width > 0 && n > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${bar.label} with ${lines.map((l) => l.label).join(' and ')}`}
          tabIndex={0}
          className="block outline-none"
          onPointerMove={(e) => pick(e.clientX)}
          onPointerLeave={() => setHover(undefined)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setHover((v) => Math.max(0, (v ?? n) - 1))
            if (e.key === 'ArrowRight') setHover((v) => Math.min(n - 1, (v ?? -1) + 1))
          }}
          onBlur={() => setHover(undefined)}
        >
          {yt.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
              <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px] tabular">
                {format(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            p.bar > 0 ? (
              <rect
                key={i}
                x={x(i) - barW / 2}
                y={y(p.bar)}
                width={barW}
                height={Math.max(1, y(0) - y(p.bar))}
                rx={Math.min(3, barW / 2)}
                className={`${bar.className} ${hover === i ? 'opacity-100' : 'opacity-60'}`}
              />
            ) : null,
          )}
          {lines.map((l, li) => (
            <polyline
              key={l.label}
              fill="none"
              stroke={l.stroke}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points.map((p, i) => `${x(i)},${y(p.lines[li])}`).join(' ')}
            />
          ))}
          {points.map((p, i) =>
            i % labelEvery === 0 ? (
              <text key={i} x={x(i)} y={height - 6} textAnchor="middle" className="fill-muted text-[10px]">
                {p.label}
              </text>
            ) : null,
          )}
          {h && hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={y(0)} className="stroke-muted" strokeWidth={1} strokeDasharray="2 3" />
              {lines.map((l, li) => (
                <circle key={l.label} cx={x(hover)} cy={y(h.lines[li])} r={4} fill={l.stroke} className="stroke-surface" strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
      )}
      {h && hover != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={x(hover) > width / 2 ? { right: width - x(hover) + 10 } : { left: x(hover) + 10 }}
        >
          <div className="mb-1 font-medium text-muted">{h.label}</div>
          <Readout keyClass={`size-2 rounded-[2px] ${bar.className}`} label={bar.label} value={format(h.bar)} />
          {lines.map((l, li) => (
            <Readout key={l.label} keyClass={`h-0.5 w-3 rounded-full ${l.className}`} label={l.label} value={format(h.lines[li])} />
          ))}
        </div>
      )}
    </div>
  )
}

function Readout({ keyClass, label, value }: { keyClass: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className={`shrink-0 ${keyClass}`} />
      <span className="tabular font-semibold">{value}</span>
      <span className="text-muted">{label}</span>
    </div>
  )
}

export interface StackSegment {
  label: string
  value: number
  className: string
}

/**
 * Columns of stacked segments, one per period (e.g. weeks). Each column is its own hit
 * target and shows its breakdown on hover or focus. Segments are split by a 2px gap.
 */
export function StackedColumns({
  columns,
  height = 96,
  caption,
}: {
  columns: { label: string; title: string; segments: StackSegment[]; note?: ReactNode }[]
  height?: number
  caption?: (i: number) => ReactNode
}) {
  const [hover, setHover] = useState<number>()
  const max = Math.max(1, ...columns.map((c) => c.segments.reduce((a, s) => a + s.value, 0)))
  const labelEvery = Math.max(1, Math.ceil(columns.length / 13))
  const h = hover != null ? columns[hover] : undefined
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height }} onPointerLeave={() => setHover(undefined)}>
        {columns.map((c, i) => {
          const total = c.segments.reduce((a, s) => a + s.value, 0)
          return (
            <button
              key={i}
              type="button"
              aria-label={`${c.title}: ${c.segments.map((s) => `${s.value} ${s.label}`).join(', ') || 'nothing'}`}
              onPointerEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(undefined)}
              className={`flex h-full min-w-0 max-w-9 flex-1 flex-col justify-end rounded-md px-px outline-none ${hover === i ? 'bg-surface-2' : ''}`}
            >
              {total === 0 ? (
                <span className="h-0.5 w-full rounded-full bg-line" />
              ) : (
                <span className="flex w-full flex-col-reverse gap-0.5 overflow-hidden rounded-t-[4px]" style={{ height: `${(total / max) * 100}%` }}>
                  {c.segments.map((s) => (s.value > 0 ? <span key={s.label} className={`w-full ${s.className}`} style={{ flexGrow: s.value, minHeight: 2 }} /> : null))}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="mt-1 flex gap-1">
        {columns.map((c, i) => (
          <span key={i} className="min-w-0 max-w-9 flex-1 truncate text-center text-[10px] text-muted">
            {i % labelEvery === 0 ? c.label : ''}
          </span>
        ))}
      </div>
      <div className="mt-2 min-h-5 text-xs text-muted" aria-live="polite">
        {h ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-text">{h.title}</span>
            {h.segments.map((s) => (
              <span key={s.label} className="flex items-center gap-1.5">
                <span className={`size-2 rounded-[2px] ${s.className}`} />
                <span className="tabular font-semibold text-text">{s.value}</span> {s.label}
              </span>
            ))}
            {h.note}
          </span>
        ) : (
          caption?.(columns.length - 1)
        )}
      </div>
    </div>
  )
}

/** A one-series bar strip for small multiples; hover shows the value under it. */
export function BarStrip({ values, labels, className, format, height = 44 }: { values: number[]; labels: string[]; className: string; format: (v: number) => string; height?: number }) {
  const [hover, setHover] = useState<number>()
  const max = Math.max(1, ...values)
  return (
    <div>
      <div className="flex items-end gap-0.5" style={{ height }} onPointerLeave={() => setHover(undefined)}>
        {values.map((v, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${labels[i]}: ${format(v)}`}
            onPointerEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(undefined)}
            className="flex h-full min-w-0 flex-1 items-end outline-none"
          >
            <span
              className={`w-full rounded-t-[3px] ${v > 0 ? className : 'bg-line'} ${hover == null || hover === i ? '' : 'opacity-50'}`}
              style={{ height: v > 0 ? `${Math.max(4, (v / max) * 100)}%` : 2 }}
            />
          </button>
        ))}
      </div>
      <div className="tabular mt-1 h-4 text-[11px] text-muted">{hover != null ? `${labels[hover]} · ${format(values[hover])}` : ''}</div>
    </div>
  )
}

/** Tiny trend line, e.g. estimated 1RM over time. */
export function Sparkline({ values, className = 'stroke-accent', width = 96, height = 28 }: { values: number[]; className?: string; width?: number; height?: number }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (width - 4) + 2},${height - 2 - ((v - min) / span) * (height - 4)}`)
  return (
    <svg width={width} height={height} aria-hidden className="shrink-0">
      <polyline points={pts.join(' ')} fill="none" className={className} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
