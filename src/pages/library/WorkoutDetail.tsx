import { ArrowLeft, Copy, ExternalLink, Pencil, Play, Trash2 } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Card } from '../../components/ui'
import { copyWorkout, describeGroup, formatPlanTime, groupPieces, plannedTotals, roundToPlates } from '../../library/workouts'
import { distanceUnit, formatDate, formatDistance, formatWeight, weightUnit } from '../../log/format'
import { useLog } from '../../log/LogStore'
import { RPE_LABELS, SPORTS, WOD_FORMATS } from '../../log/sports'
import { findMax, sortSessions } from '../../log/stats'
import { describeAim, summariseTargets } from '../../log/targets'
import type { Workout } from '../../log/types'
import { useSettings } from '../../settings/SettingsContext'
import { Stat } from '../log/SessionDetail'

export function Structure({ w }: { w: Workout }) {
  const { settings } = useSettings()
  const groups = groupPieces(w.pieces ?? [])
  return (
    <Card title={`Structure · ${w.pieces!.length} rep${w.pieces!.length === 1 ? '' : 's'}`}>
      <ol className="divide-y divide-line">
        {groups.map((g) => (
          <li key={g.first} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-baseline gap-3">
              <span className="tabular w-12 shrink-0 text-xs text-muted">{g.count > 1 ? `#${g.first + 1}–${g.first + g.count}` : `#${g.first + 1}`}</span>
              <span className="tabular font-semibold">{describeGroup(g, w.sport, settings.units)}</span>
            </span>
            <span className="tabular pl-15 text-sm text-accent-strong sm:pl-0">{describeAim(g.piece, w.sport, settings.units)}</span>
            {g.piece.notes && <span className="pl-15 text-sm text-muted sm:hidden">{g.piece.notes}</span>}
          </li>
        ))}
      </ol>
    </Card>
  )
}

export function Exercises({ w }: { w: Workout }) {
  const { settings } = useSettings()
  const { maxes } = useLog()
  const wu = weightUnit(settings.units)
  return (
    <Card title="Exercises">
      <div className="space-y-5">
        {w.exercises!.map((e) => {
          const oneRm = findMax(maxes, e.name)?.kg
          let working = 0
          return (
            <div key={e.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">{e.name || 'Unnamed exercise'}</h3>
                <span className="text-xs text-muted">
                  {oneRm ? `Your 1RM ${formatWeight(oneRm, settings.units)}${wu}` : e.sets.some((s) => s.pct != null) ? 'No 1RM saved: % sets will be blank' : ''}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {e.sets.map((s) => {
                  if (!s.warmup) working++
                  const kg = s.pct != null && oneRm ? roundToPlates((s.pct / 100) * oneRm) : s.weightKg
                  return (
                    <span key={s.id} className={`tabular rounded-lg px-2.5 py-1.5 text-sm ${s.warmup ? 'bg-surface-2 text-muted' : 'bg-sport-strength/15'}`}>
                      <span className="mr-1.5 text-xs text-muted">{s.warmup ? 'W' : working}</span>
                      {s.pct != null ? `${s.pct}%` : kg != null ? `${formatWeight(kg, settings.units)}${wu}` : 'BW'}
                      {s.reps != null && ` × ${s.reps}`}
                      {s.pct != null && kg != null && <span className="text-muted"> · {formatWeight(kg, settings.units)}{wu}</span>}
                      {s.rpe != null && <span className="text-muted"> @{s.rpe}</span>}
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

export function History({ w }: { w: Workout }) {
  const { sessions } = useLog()
  const { settings } = useSettings()
  const logged = sortSessions(sessions.filter((s) => s.workoutId === w.id))
  return (
    <Card title={`Logged ${logged.length}×`}>
      {logged.length ? (
        <ul className="-mx-2">
          {logged.slice(0, 10).map((s) => {
            const t = s.pieces?.length ? summariseTargets(s.pieces, s.sport, settings.hrZoneTops) : undefined
            return (
              <li key={s.id}>
                <Link to={`/log/session/${s.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
                  <span className="font-medium">{formatDate(s.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  <span className="tabular text-muted">
                    {[t?.targeted && `${t.hit}/${t.targeted} on target`, s.rpe != null && `RPE ${s.rpe}`].filter(Boolean).join(' · ')}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">Not logged yet. Each time you log it, it shows here so you can compare attempts.</p>
      )}
    </Card>
  )
}

export default function WorkoutDetail() {
  const { id } = useParams()
  const { workouts, saveWorkout, deleteWorkout } = useLog()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const w = workouts.find((x) => x.id === id)
  if (!w) return <Navigate to="/library" replace />

  const def = SPORTS[w.sport]
  const type = def.types.find((t) => t.value === w.type)?.label
  const totals = plannedTotals(w)
  const unit = w.pieces?.length && w.sport !== 'bike' ? 'm' : distanceUnit(w.sport, settings.units)
  const aim = describeAim(w, w.sport, settings.units)
  const isLink = w.source && /^https?:\/\//.test(w.source)

  const remove = () => {
    if (!confirm('Delete this workout from the library? Sessions you logged from it are kept.')) return
    deleteWorkout(w.id)
    navigate('/library', { replace: true })
  }

  const duplicate = () => {
    const copy = saveWorkout(copyWorkout(w))
    navigate(`/library/${copy.id}/edit`)
  }

  return (
    <div className="space-y-5">
      <Link to="/library" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Library
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${def.soft} ${def.text}`}>
            <def.icon className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{w.name}</h1>
            <p className="text-sm text-muted">{[def.label, type].filter(Boolean).join(' · ')}</p>
            {w.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {w.tags.map((t) => (
                  <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/library/${w.id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2">
            <Pencil className="size-4" /> Edit
          </Link>
          <button type="button" onClick={duplicate} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2">
            <Copy className="size-4" /> Duplicate
          </button>
          <button type="button" onClick={remove} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-text">
            <Trash2 className="size-4" /> Delete
          </button>
        </div>
      </div>

      <Link
        to={`/log/new?workout=${w.id}`}
        className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3.5 font-semibold text-on-accent hover:opacity-90 sm:inline-flex sm:w-auto"
      >
        <Play className="size-4" /> Log this workout
      </Link>

      {(totals.workSec || totals.distM || totals.restSec || w.rpe || aim) && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {totals.workSec != null && <Stat label={w.pieces?.length ? 'Work' : 'Time'} value={formatPlanTime(totals.workSec)} />}
          {totals.distM != null && <Stat label={w.pieces?.length ? 'Work distance' : 'Distance'} value={formatDistance(totals.distM, unit)} unit={unit} />}
          {totals.restSec != null && <Stat label="Rest" value={formatPlanTime(totals.restSec)} />}
          {w.rpe != null && <Stat label="Target RPE" value={w.rpe} unit="/10" sub={RPE_LABELS[w.rpe]} />}
          {aim && <Stat label="Aim" value={<span className="text-base">{aim}</span>} />}
        </div>
      )}

      {(w.description || w.source) && (
        <Card>
          {w.description && <p className="whitespace-pre-line text-sm">{w.description}</p>}
          {w.source && (
            <p className={`text-sm text-muted ${w.description ? 'mt-3' : ''}`}>
              Source:{' '}
              {isLink ? (
                <a href={w.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent-strong">
                  {w.source.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)} <ExternalLink className="size-3.5" />
                </a>
              ) : (
                <span className="text-text">{w.source}</span>
              )}
            </p>
          )}
        </Card>
      )}

      {w.pieces?.length ? <Structure w={w} /> : null}
      {w.exercises?.length ? <Exercises w={w} /> : null}
      {w.wod && (
        <Card title="WOD">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-sport-strength/15 px-2.5 py-1 text-sm font-semibold">{WOD_FORMATS.find((f) => f.value === w.wod!.format)?.label}</span>
            {w.wod.timeCapSec != null && <span className="text-sm text-muted">{w.wod.format === 'emom' ? '' : 'Cap '}{formatPlanTime(w.wod.timeCapSec)}</span>}
          </div>
          {w.wod.description && <p className="mt-3 whitespace-pre-line text-sm">{w.wod.description}</p>}
        </Card>
      )}

      <History w={w} />
    </div>
  )
}
