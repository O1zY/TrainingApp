import { ArrowLeft, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { TrendChart } from '../../components/charts'
import { Field, NumberInput } from '../../components/fields'
import { Card, PageHeader, Segmented, StatTile } from '../../components/ui'
import { changeOver, weightSeries } from '../../analysis/weight'
import { formatDate, todayIso, weightFactor, weightUnit } from '../../log/format'
import { useLog } from '../../log/LogStore'
import type { Wellbeing } from '../../log/types'
import { addDays, daysBetween } from '../../plan/dates'
import { useSettings } from '../../settings/SettingsContext'

type Range = '4' | '12' | '26' | '52' | 'all'

const RANGES: { value: Range; label: string }[] = [
  { value: '4', label: '4 wk' },
  { value: '12', label: '12 wk' },
  { value: '26', label: '6 mo' },
  { value: '52', label: '1 yr' },
  { value: 'all', label: 'All' },
]

/** A check-in that holds nothing but its date, so deleting the weight can drop it. */
const isEmpty = (w: Wellbeing) => Object.entries(w).every(([k, v]) => k === 'date' || k === 'updatedAt' || v == null || v === false || v === '')

export default function Weight() {
  const { wellbeing, saveWellbeing, deleteWellbeing } = useLog()
  const { settings, update } = useSettings()
  const units = settings.units
  const unit = weightUnit(units)
  const today = todayIso()
  const [date, setDate] = useState(today)
  const [kg, setKg] = useState<number | undefined>(() => wellbeing.find((w) => w.date === today)?.weightKg)
  const [range, setRange] = useState<Range>('12')
  const [saved, setSaved] = useState<string>()

  const series = useMemo(() => weightSeries(wellbeing), [wellbeing])
  const latest = series.at(-1)
  const shown = range === 'all' ? series : series.filter((p) => p.date >= addDays(today, -Number(range) * 7))
  const fmt = (v: number) => (v / weightFactor(units)).toFixed(1)
  /** "+0.4" / "−0.2"; a change that rounds to nothing reads "0.0" rather than "−0". */
  const signed = (v: number | undefined) => {
    if (v == null) return '—'
    const text = Math.abs(v / weightFactor(units)).toFixed(1)
    return text === '0.0' ? text : `${v > 0 ? '+' : '−'}${text}`
  }
  const target = settings.targetWeightKg
  const change4 = changeOver(series, 28)
  const change12 = changeOver(series, 84)
  const toGo = latest && target != null ? latest.avgKg - target : undefined

  const pickDate = (d: string) => {
    setDate(d)
    setKg(wellbeing.find((w) => w.date === d)?.weightKg)
  }

  const save = (e: FormEvent) => {
    e.preventDefault()
    if (kg == null) return
    const { updatedAt: _t, ...rest } = wellbeing.find((w) => w.date === date) ?? { date }
    saveWellbeing({ ...rest, date, weightKg: kg })
    setSaved(`Saved ${fmt(kg)}${unit} for ${date === today ? 'today' : formatDate(date)}.`)
  }

  const remove = (w: Wellbeing) => {
    const { updatedAt: _t, weightKg: _w, ...rest } = w
    if (isEmpty({ ...rest, updatedAt: w.updatedAt })) deleteWellbeing(w.date)
    else saveWellbeing(rest)
    if (w.date === date) setKg(undefined)
  }

  const history = [...series].reverse().slice(0, 14)

  return (
    <div className="space-y-5">
      <Link to="/log" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Log
      </Link>
      <PageHeader title="Weight" subtitle="Weigh in whenever you like. The 7-day average is the number to watch." />

      <Card>
        <form onSubmit={save} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="Date">
            <input
              type="date"
              max={today}
              className="tabular w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base md:py-2 md:text-sm"
              value={date}
              onChange={(e) => e.target.value && pickDate(e.target.value)}
            />
          </Field>
          <Field label="Weight" unit={unit}>
            <NumberInput value={kg} factor={weightFactor(units)} decimals={1} onChange={setKg} placeholder={latest ? fmt(latest.kg) : '75.0'} />
          </Field>
          <button type="submit" disabled={kg == null} className="col-span-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90 disabled:opacity-40 sm:col-span-1">
            Save weight
          </button>
        </form>
        {saved && <p className="mt-3 text-sm text-muted" role="status">{saved}</p>}
      </Card>

      {series.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No weights yet. Add your first above; weights from daily check-ins show here too.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            <StatTile label="Latest" value={fmt(latest!.kg)} unit={unit} />
            <StatTile label="7-day average" value={fmt(latest!.avgKg)} unit={unit} />
            <StatTile label="Last 4 weeks" value={signed(change4)} unit={change4 == null ? undefined : unit} />
            {target != null && toGo != null ? (
              <StatTile label={toGo > 0 ? 'To lose to goal' : 'Under goal by'} value={fmt(Math.abs(toGo))} unit={unit} />
            ) : (
              <StatTile label="Last 12 weeks" value={signed(change12)} unit={change12 == null ? undefined : unit} />
            )}
          </div>

          <Card title="Trend" action={<Segmented value={range} options={RANGES} onChange={setRange} />}>
            {shown.length ? (
              <TrendChart
                points={shown.map((p) => ({ label: formatDate(p.date, { day: 'numeric', month: 'short' }), at: daysBetween(shown[0].date, p.date), value: p.kg, avg: p.avgKg }))}
                goal={target}
                format={fmt}
                valueLabel="Weigh-in"
                avgLabel="7-day average"
                goalLabel="Goal"
              />
            ) : (
              <p className="text-sm text-muted">No weigh-ins in this range.</p>
            )}
          </Card>
        </>
      )}

      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
        <Card title="Goal weight">
          <div className="flex items-end gap-3">
            <Field label="Target" unit={unit} className="max-w-40">
              <NumberInput value={target} factor={weightFactor(units)} decimals={1} onChange={(v) => update({ targetWeightKg: v })} placeholder="Optional" />
            </Field>
            {target != null && (
              <button type="button" onClick={() => update({ targetWeightKg: undefined })} className="pb-2.5 text-sm font-medium text-muted hover:text-text md:pb-2">
                Clear
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-muted">Shown as a dashed line on the chart. Leave it empty to track without a goal.</p>
        </Card>

        <Card title="Recent weigh-ins">
          {history.length ? (
            <ul className="divide-y divide-line">
              {history.map((p, i) => {
                const prev = history[i + 1]
                const entry = wellbeing.find((w) => w.date === p.date)!
                return (
                  <li key={p.date} className="flex items-center gap-3 py-2 text-sm">
                    <button type="button" onClick={() => pickDate(p.date)} className="min-w-0 flex-1 text-left hover:text-accent-strong">
                      <span className="tabular font-semibold">
                        {fmt(p.kg)} {unit}
                      </span>
                      <span className="ml-2 text-muted">{formatDate(p.date)}</span>
                    </button>
                    {prev && (
                      <span className="tabular text-xs text-muted">
                        {signed(p.kg - prev.kg)}
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={`Delete weight for ${formatDate(p.date)}`}
                      onClick={() => confirm('Delete this weigh-in?') && remove(entry)}
                      className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing yet.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
