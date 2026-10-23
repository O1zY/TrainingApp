import { ArrowLeft, HeartPulse, Pencil, Plus, Repeat, Trash2, Waypoints } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Card } from '../../components/ui'
import {
  PACE_LABEL,
  distanceUnit,
  elevationFactor,
  elevationUnit,
  ergWatts,
  formatDate,
  formatDistance,
  formatPace,
  formatTime,
  formatWeight,
  paceKind,
  paceValue,
  weightUnit,
} from '../../log/format'
import { useLog } from '../../log/LogStore'
import { MULTISPORT_KINDS, RPE_LABELS, SPORTS, WOD_FORMATS, sessionName } from '../../log/sports'
import { exerciseStats, pieceWatts, sessionLoad, summarisePieces } from '../../log/stats'
import type { Session } from '../../log/types'
import { useSettings } from '../../settings/SettingsContext'
import { WellbeingSummary } from './Wellbeing'

export function Stat({ label, value, unit, sub }: { label: string; value: ReactNode; unit?: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="tabular mt-0.5 text-lg font-bold tracking-tight">
        {value}
        {unit && <span className="ml-1 text-xs font-medium text-muted">{unit}</span>}
      </div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function SessionStats({ s }: { s: Session }) {
  const { settings } = useSettings()
  const kind = paceKind(s.sport, settings.units)
  const unit = distanceUnit(s.sport, settings.units)
  const pace = kind ? paceValue(kind, s.distanceM, s.durationSec) : undefined
  const watts = s.watts ?? (s.sport === 'erg' ? ergWatts(pace) : undefined)
  const load = sessionLoad(s)

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {s.durationSec != null && <Stat label="Time" value={formatTime(s.durationSec)} />}
      {s.distanceM != null && <Stat label="Distance" value={formatDistance(s.distanceM, unit)} unit={unit} />}
      {kind && pace != null && <Stat label={kind.startsWith('speed') ? 'Speed' : 'Pace'} value={formatPace(kind, pace)} unit={PACE_LABEL[kind]} />}
      {s.rpe != null && <Stat label="RPE" value={s.rpe} unit="/10" sub={RPE_LABELS[s.rpe]} />}
      {load != null && <Stat label="Load" value={load} sub="RPE × min" />}
      {s.hrAvg != null && <Stat label="HR avg" value={s.hrAvg} unit="bpm" sub={s.hrMax ? `max ${s.hrMax}` : undefined} />}
      {s.hrAvg == null && s.hrMax != null && <Stat label="HR max" value={s.hrMax} unit="bpm" />}
      {s.rate != null && <Stat label={s.sport === 'row' || s.sport === 'erg' ? 'Rate' : 'Cadence'} value={s.rate} unit={s.sport === 'bike' ? 'rpm' : 'spm'} />}
      {watts != null && <Stat label="Watts" value={watts} unit="W" sub={s.watts ? undefined : 'from split'} />}
      {s.normWatts != null && <Stat label="Norm. power" value={s.normWatts} unit="W" />}
      {s.dragFactor != null && <Stat label="Drag factor" value={s.dragFactor} />}
      {s.elevationM != null && <Stat label="Elevation" value={Math.round(s.elevationM / elevationFactor(settings.units))} unit={elevationUnit(settings.units)} />}
    </div>
  )
}

function Zones({ zones }: { zones: (number | undefined)[] }) {
  const total = zones.reduce<number>((a, z) => a + (z ?? 0), 0)
  if (!total) return null
  // Opacity steps keep zones in the accent colour rather than inventing a new palette.
  const shades = ['opacity-30', 'opacity-50', 'opacity-70', 'opacity-85', 'opacity-100']
  return (
    <Card title="Heart-rate zones">
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
        {zones.map((z, i) => (z ? <div key={i} className={`bg-accent ${shades[i]}`} style={{ width: `${(z / total) * 100}%` }} /> : null))}
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2 text-center">
        {zones.map((z, i) => (
          <div key={i}>
            <div className="text-xs font-medium text-muted">Z{i + 1}</div>
            <div className="tabular text-sm font-semibold">{z ? formatTime(z, false) : '—'}</div>
            <div className="tabular text-xs text-muted">{z ? `${Math.round((z / total) * 100)}%` : ''}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function PiecesTable({ s }: { s: Session }) {
  const { settings } = useSettings()
  const pieces = s.pieces ?? []
  const kind = paceKind(s.sport, settings.units)
  const unit = s.sport === 'bike' ? distanceUnit(s.sport, settings.units) : 'm'
  const sum = summarisePieces(pieces, s.sport, kind)
  const showWatts = s.sport === 'erg' || s.sport === 'bike'
  const showRate = pieces.some((p) => p.rate != null)
  const showHr = pieces.some((p) => p.hrAvg != null || p.hrMax != null)
  const showRest = pieces.some((p) => p.restSec != null)
  const th = 'px-2 py-2 text-left text-xs font-medium text-muted'
  const td = 'tabular px-2 py-2'

  return (
    <Card title={`Pieces · ${pieces.length}`}>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className={th}>#</th>
              <th className={th}>Dist</th>
              <th className={th}>Time</th>
              {kind && <th className={th}>{kind.startsWith('speed') ? PACE_LABEL[kind] : `Pace ${PACE_LABEL[kind]}`}</th>}
              {showRate && <th className={th}>Rate</th>}
              {showWatts && <th className={th}>W</th>}
              {showHr && <th className={th}>HR</th>}
              {showRest && <th className={th}>Rest</th>}
            </tr>
          </thead>
          <tbody>
            {pieces.map((p, i) => {
              const pace = kind ? paceValue(kind, p.distanceM, p.durationSec) : undefined
              const w = pieceWatts(p, s.sport)
              return (
                <tr key={p.id} className={`border-b border-line/60 ${sum.fastest === i ? 'bg-accent-soft/60' : ''}`}>
                  <td className={`${td} font-semibold`}>{i + 1}</td>
                  <td className={td}>{p.distanceM != null ? `${formatDistance(p.distanceM, unit)}${unit}` : '—'}</td>
                  <td className={td}>{formatTime(p.durationSec) || '—'}</td>
                  {kind && <td className={`${td} font-semibold`}>{formatPace(kind, pace) || '—'}</td>}
                  {showRate && <td className={td}>{p.rate ?? '—'}</td>}
                  {showWatts && <td className={td}>{w ?? '—'}</td>}
                  {showHr && (
                    <td className={td}>
                      {p.hrAvg ?? '—'}
                      {p.hrMax != null && <span className="text-muted"> / {p.hrMax}</span>}
                    </td>
                  )}
                  {showRest && <td className={td}>{i < pieces.length - 1 ? formatTime(p.restSec) || '—' : ''}</td>}
                </tr>
              )
            })}
            <tr className="font-semibold">
              <td className={td}>Σ</td>
              <td className={td}>{sum.distM ? `${formatDistance(sum.distM, unit)}${unit}` : '—'}</td>
              <td className={td}>{formatTime(sum.sec) || '—'}</td>
              {kind && <td className={td}>{formatPace(kind, sum.avgPace) || '—'}</td>}
              {showRate && <td className={td}>{sum.avgRate != null ? sum.avgRate.toFixed(1) : '—'}</td>}
              {showWatts && <td className={td}>{sum.avgWatts != null ? Math.round(sum.avgWatts) : '—'}</td>}
              {showHr && <td className={td}>{sum.avgHr != null ? Math.round(sum.avgHr) : '—'}{sum.maxHr != null && <span className="text-muted"> / {sum.maxHr}</span>}</td>}
              {showRest && <td className={td}>{formatTime(sum.restSec) || '—'}</td>}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Bottom row: totals, with averages for pace, rate, watts and HR. Highlighted row is the fastest piece.</p>
      {pieces.some((p) => p.notes) && (
        <ul className="mt-3 space-y-1 text-sm">
          {pieces.map((p, i) => p.notes && <li key={p.id}><span className="font-semibold">#{i + 1}</span> {p.notes}</li>)}
        </ul>
      )}
    </Card>
  )
}

function StrengthCard({ s }: { s: Session }) {
  const { settings } = useSettings()
  const wu = weightUnit(settings.units)
  return (
    <Card title="Exercises">
      <div className="space-y-5">
        {(s.exercises ?? []).map((e) => {
          const st = exerciseStats(e)
          let working = 0
          return (
            <div key={e.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">{e.name || 'Unnamed exercise'}</h3>
                <span className="tabular text-xs text-muted">
                  {st.sets} sets · {st.reps} reps · {formatWeight(st.volumeKg, settings.units)}
                  {wu}
                  {st.e1rm ? ` · e1RM ${formatWeight(st.e1rm, settings.units)}${wu}` : ''}
                  {e.oneRmKg ? ` · 1RM ${formatWeight(e.oneRmKg, settings.units)}${wu}` : ''}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {e.sets.map((set) => {
                  if (!set.warmup) working++
                  const pct = e.oneRmKg && set.weightKg ? Math.round((set.weightKg / e.oneRmKg) * 100) : undefined
                  return (
                    <span key={set.id} className={`tabular rounded-lg px-2.5 py-1.5 text-sm ${set.warmup ? 'bg-surface-2 text-muted' : 'bg-sport-strength/15'}`}>
                      <span className="mr-1.5 text-xs text-muted">{set.warmup ? 'W' : working}</span>
                      {set.weightKg != null ? `${formatWeight(set.weightKg, settings.units)}${wu}` : 'BW'}
                      {set.reps != null && ` × ${set.reps}`}
                      {pct != null && <span className="text-muted"> · {pct}%</span>}
                      {set.rpe != null && <span className="text-muted"> @{set.rpe}</span>}
                    </span>
                  )
                })}
              </div>
              {e.notes && <p className="mt-1.5 text-sm text-muted">{e.notes}</p>}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function WodCard({ s }: { s: Session }) {
  const w = s.wod!
  const result =
    w.format === 'fortime' ? formatTime(w.resultSec) : w.rounds != null || w.reps != null ? `${w.rounds ?? 0} rounds${w.reps ? ` + ${w.reps} reps` : ''}` : ''
  return (
    <Card title="WOD">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-sport-strength/15 px-2.5 py-1 text-sm font-semibold">{WOD_FORMATS.find((f) => f.value === w.format)?.label}</span>
        {w.timeCapSec != null && <span className="text-sm text-muted">{w.format === 'emom' ? '' : 'Cap '}{formatTime(w.timeCapSec, false)}</span>}
        {w.rx && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-strong">Rx</span>}
      </div>
      {w.description && <p className="mt-3 whitespace-pre-line text-sm">{w.description}</p>}
      {result && (
        <p className="tabular mt-3 text-2xl font-bold">
          {result}
        </p>
      )}
    </Card>
  )
}

export default function SessionDetail() {
  const { id } = useParams()
  const { sessions, multisport, wellbeing, deleteSession } = useLog()
  const navigate = useNavigate()
  const s = sessions.find((x) => x.id === id)
  if (!s) return <Navigate to="/log" replace />

  const def = SPORTS[s.sport]
  const event = s.multisportId ? multisport.find((m) => m.id === s.multisportId) : undefined
  const checkin = wellbeing.find((w) => w.date === s.date)

  const remove = () => {
    if (!confirm('Delete this session? This can’t be undone.')) return
    deleteSession(s.id)
    navigate(event ? `/log/multi/${event.id}` : '/log', { replace: true })
  }

  return (
    <div className="space-y-5">
      <Link to="/log" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Log
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${def.soft} ${def.text}`}>
            <def.icon className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{sessionName(s)}</h1>
            <p className="text-sm text-muted">
              {formatDate(s.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              {s.startTime && ` · ${s.startTime.slice(0, 5)}`}
              {s.indoor && (s.sport === 'run' ? ' · Treadmill' : ' · Indoor')}
              {s.source === 'strava' && ' · from Strava'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/log/session/${s.id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2">
            <Pencil className="size-4" /> Edit
          </Link>
          <button type="button" onClick={remove} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-text">
            <Trash2 className="size-4" /> Delete
          </button>
        </div>
      </div>

      {event && (
        <Link to={`/log/multi/${event.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm hover:bg-surface-2">
          <Waypoints className="size-4 text-muted" />
          Leg {event.legIds.indexOf(s.id) + 1} of <span className="font-semibold">{event.title || MULTISPORT_KINDS.find((k) => k.value === event.kind)?.label}</span>
        </Link>
      )}

      <SessionStats s={s} />

      {(s.feel?.length || s.notes) && (
        <Card>
          {s.feel?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {s.feel.map((f) => (
                <span key={f} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium">
                  {f}
                </span>
              ))}
            </div>
          ) : null}
          {s.notes && <p className={`whitespace-pre-line text-sm ${s.feel?.length ? 'mt-3' : ''}`}>{s.notes}</p>}
        </Card>
      )}

      {s.pieces?.length ? <PiecesTable s={s} /> : null}
      {s.exercises?.length ? <StrengthCard s={s} /> : null}
      {s.wod && <WodCard s={s} />}
      {s.zonesSec && <Zones zones={s.zonesSec} />}

      <Card
        title="Check-in that day"
        action={
          <Link to={`/log/wellbeing/${s.date}${checkin ? '' : '/edit'}`} className="text-sm font-medium text-accent-strong">
            {checkin ? 'Open' : 'Add'}
          </Link>
        }
      >
        {checkin ? (
          <WellbeingSummary w={checkin} />
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted">
            <HeartPulse className="size-4" /> No wellbeing check-in for this day.
          </p>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link to={`/log/new?from=${s.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">
          <Repeat className="size-4" /> Log this again
        </Link>
        <Link to={`/log/new?sport=${s.sport === 'transition' ? 'other' : s.sport}`} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90">
          <Plus className="size-4" /> Log another session
        </Link>
      </div>
    </div>
  )
}
