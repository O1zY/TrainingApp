import { Crosshair } from 'lucide-react'
import { useState } from 'react'
import { PACE_LABEL, formatPace, isSpeed, paceKind, paceToBase, paceValue, parseTime } from '../log/format'
import { pieceWatts } from '../log/stats'
import {
  STATUS_LABEL,
  TARGET_METRICS,
  checkTarget,
  checkZone,
  describeAim,
  displayValue,
  statusColor,
  summariseTargets,
  targetFromInputs,
} from '../log/targets'
import type { Aim, Piece, Sport, TargetMetric } from '../log/types'
import { useSettings } from '../settings/SettingsContext'
import { Field, NumberInput, ParsedInput, inputClass } from './fields'

/** Target metrics that make sense for a sport. */
export function metricsFor(sport: Sport): TargetMetric[] {
  const out: TargetMetric[] = []
  if (['row', 'erg', 'run', 'bike', 'swim'].includes(sport)) out.push('pace')
  if (sport === 'erg' || sport === 'bike') out.push('power')
  out.push('hr')
  if (['row', 'erg', 'run', 'bike'].includes(sport)) out.push('rate')
  return out
}

const rateUnit = (sport: Sport) => (sport === 'bike' ? 'rpm' : 'spm')

/** Target (two bounds, or one for "this or better"), HR zone and rate. Values are typed in display units. */
export function AimFields({ sport, value, onChange }: { sport: Sport; value: Aim; onChange: (a: Aim) => void }) {
  const { settings } = useSettings()
  const metrics = metricsFor(sport)
  const [metric, setMetric] = useState<TargetMetric>(value.target?.metric ?? metrics[0])
  const kind = paceKind(sport, settings.units)
  const speed = metric === 'pace' && kind != null && isSpeed(kind)

  const t = value.target?.metric === metric ? value.target : undefined
  const shown = (v?: number) => (v == null ? undefined : displayValue(metric, v, sport, settings.units))
  // One-sided targets show in the first box. Speed lists the larger s/km second.
  const first = t ? (t.min != null && t.max != null ? (speed ? t.max : t.min) : (t.min ?? t.max)) : undefined
  const second = t && t.min != null && t.max != null ? (speed ? t.min : t.max) : undefined
  const toBase = (v?: number) => (v == null ? undefined : metric === 'pace' && kind ? paceToBase(kind, v) : v)

  const set = (a?: number, b?: number) => onChange({ ...value, target: targetFromInputs(metric, toBase(a), toBase(b)) })

  const valueInput = (v: number | undefined, onSet: (n?: number) => void, label: string) =>
    metric === 'pace' && kind && !speed ? (
      <ParsedInput<number>
        aria-label={label}
        value={v}
        inputMode="text"
        placeholder="m:ss"
        format={(x) => formatPace(kind, x)}
        parse={(s) => {
          const n = parseTime(s, 'min')
          return n && n > 0 ? n : undefined
        }}
        onChange={onSet}
      />
    ) : (
      <NumberInput aria-label={label} value={v} decimals={1} integer={metric !== 'pace'} placeholder="—" onChange={onSet} />
    )

  const unit = metric === 'pace' && kind ? PACE_LABEL[kind] : metric === 'power' ? 'W' : metric === 'hr' ? 'bpm' : rateUnit(sport)

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[7rem_1fr_1fr_6rem_5rem]">
      <Field label="Target">
        <select
          className={inputClass}
          value={metric}
          onChange={(e) => {
            setMetric(e.target.value as TargetMetric)
            onChange({ ...value, target: undefined })
          }}
        >
          {TARGET_METRICS.filter((m) => metrics.includes(m.value)).map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={metric === 'pace' && !speed ? 'Pace (or from)' : 'From'} unit={unit}>
        {valueInput(shown(first), (a) => set(a, shown(second)), 'Target from')}
      </Field>
      <Field label="To" unit={unit} hint={undefined}>
        {valueInput(shown(second), (b) => set(shown(first), b), 'Target to')}
      </Field>
      <Field label="HR zone">
        <select className={inputClass} value={value.hrZone ?? ''} onChange={(e) => onChange({ ...value, hrZone: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">—</option>
          {[1, 2, 3, 4, 5].map((z) => (
            <option key={z} value={z}>
              Z{z}
            </option>
          ))}
        </select>
      </Field>
      {metricsFor(sport).includes('rate') && (
        <Field label="Rate" unit={rateUnit(sport)}>
          <NumberInput integer value={value.targetRate} placeholder="—" onChange={(targetRate) => onChange({ ...value, targetRate })} />
        </Field>
      )}
    </div>
  )
}

/** Collapsed "Target: …" line that opens the aim fields. Keeps per-rep forms short. */
export function AimToggle({ sport, value, onChange, label = 'Add target' }: { sport: Sport; value: Aim; onChange: (a: Aim) => void; label?: string }) {
  const { settings } = useSettings()
  const [open, setOpen] = useState(false)
  const text = describeAim(value, sport, settings.units)
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium ${text ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:text-text'}`}
      >
        <Crosshair className="size-3.5" />
        {text ? `Target: ${text}` : label}
      </button>
      {open && (
        <div className="mt-2 rounded-xl bg-surface-2 p-3">
          <AimFields sport={sport} value={value} onChange={onChange} />
          <p className="mt-2 text-xs text-muted">
            One value means “this or better”: pace this or faster, watts or rate at least this. Two values make a range.
          </p>
        </div>
      )}
    </div>
  )
}

/** The headline number for a rep chip: pace/split, or watts on the bike. */
function repLabel(p: Piece, sport: Sport, units: ReturnType<typeof useSettings>['settings']['units']) {
  const metric = p.target?.metric
  if (metric === 'power' || (sport === 'bike' && p.watts)) {
    const w = pieceWatts(p, sport)
    if (w) return `${w}W`
  }
  if (metric === 'hr' && p.hrAvg) return `${p.hrAvg}`
  if (metric === 'rate' && p.rate) return `r${p.rate}`
  const kind = paceKind(sport, units)
  const pace = kind ? paceValue(kind, p.distanceM, p.durationSec) : undefined
  return kind && pace != null ? formatPace(kind, pace) : p.hrAvg ? `${p.hrAvg}` : '—'
}

/** One chip per rep, coloured by its target (or HR zone when that's all there is), with an HR bar under it. */
export function RepStrip({ pieces, sport }: { pieces: Piece[]; sport: Sport }) {
  const { settings } = useSettings()
  const tops = settings.hrZoneTops
  const sum = summariseTargets(pieces, sport, tops)
  const floor = Math.round(settings.maxHR * 0.5)
  const scale = (bpm: number) => Math.max(0, Math.min(100, ((bpm - floor) / (settings.maxHR - floor)) * 100))

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {pieces.map((p, i) => {
          const a = checkTarget(p, sport)
          const z = checkZone(p, tops, sport)
          const color = statusColor(a ?? z)
          const zoneColor = statusColor(z)
          const title = [`Rep ${i + 1}`, a && `${STATUS_LABEL[a.status]}${a.off ? ` (${(a.off * 100).toFixed(1)}% off)` : ''}`, z && `HR ${p.hrAvg}: ${z.status === 'hit' ? 'in' : 'outside'} Z${p.hrZone}`]
            .filter(Boolean)
            .join(' · ')
          return (
            <div key={p.id} title={title} className="w-16 overflow-hidden rounded-lg border border-line bg-surface">
              <div className="h-1" style={{ background: color ?? 'var(--line)' }} />
              <div className="px-1.5 pb-1.5 pt-1 text-center">
                <div className="text-[10px] font-medium text-muted">#{i + 1}</div>
                <div className="tabular text-sm font-bold" style={{ color }}>
                  {repLabel(p, sport, settings.units)}
                </div>
                {p.hrAvg != null && (
                  <div className="relative mt-1 h-1.5 rounded-full bg-surface-2">
                    {p.hrZone && (
                      <div
                        className="absolute inset-y-0 rounded-full bg-text/15"
                        style={{
                          left: `${scale(p.hrZone > 1 ? tops[p.hrZone - 2] : floor)}%`,
                          right: `${100 - scale(p.hrZone < 5 ? tops[p.hrZone - 1] : settings.maxHR)}%`,
                        }}
                      />
                    )}
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${scale(p.hrAvg)}%`, background: zoneColor ?? 'var(--muted)' }} />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {sum.targeted > 0 && (
          <span>
            <span className="font-semibold text-text">
              {sum.hit}/{sum.targeted}
            </span>{' '}
            on target
          </span>
        )}
        {sum.zoneTargeted > 0 && (
          <span>
            <span className="font-semibold text-text">
              {sum.zoneHit}/{sum.zoneTargeted}
            </span>{' '}
            in HR zone
          </span>
        )}
        {sum.drift != null && Math.abs(sum.drift) >= 0.005 && (
          <span>
            First → last rep {sum.driftMetric === 'pace' ? (sum.drift > 0 ? 'faster' : 'slower') : sum.drift > 0 ? 'up' : 'down'} by {(Math.abs(sum.drift) * 100).toFixed(1)}%
          </span>
        )}
        {(sum.targeted > 0 || sum.zoneTargeted > 0) && (
          <span className="flex items-center gap-2">
            <Dot color="var(--hit)" /> on
            <Dot color="var(--over)" /> harder
            <Dot color="var(--miss-far)" /> missed
          </span>
        )}
      </div>
    </div>
  )
}

const Dot = ({ color }: { color: string }) => <span className="inline-block size-2 rounded-full" style={{ background: color }} />
