import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Field, NumberInput, Scale, TextArea, TextInput, Toggle } from '../../components/fields'
import { Card, PageHeader } from '../../components/ui'
import { formatDate, formatWeight, todayIso, weightFactor, weightUnit } from '../../log/format'
import { useLog } from '../../log/LogStore'
import { sortSessions, wellnessScore, type WELLBEING_BAD, type WELLBEING_GOOD } from '../../log/stats'
import { SPORTS, sessionName } from '../../log/sports'
import type { Wellbeing } from '../../log/types'
import { useSettings } from '../../settings/SettingsContext'

type Draft = Omit<Wellbeing, 'updatedAt'>

type ScaleKey = (typeof WELLBEING_GOOD)[number] | (typeof WELLBEING_BAD)[number]

/** Scales where a high number is good, and ones where 1 = none. */
const GOOD: { key: ScaleKey; label: string; low: string; high: string }[] = [
  { key: 'sleepQuality', label: 'Sleep quality', low: 'Awful', high: 'Great' },
  { key: 'energy', label: 'Energy', low: 'Drained', high: 'Buzzing' },
  { key: 'mood', label: 'Mood', low: 'Low', high: 'Great' },
  { key: 'motivation', label: 'Motivation to train', low: 'None', high: 'Can’t wait' },
]
const BAD: { key: ScaleKey; label: string; low: string; high: string }[] = [
  { key: 'soreness', label: 'Muscle soreness', low: 'None', high: 'Very sore' },
  { key: 'fatigue', label: 'Fatigue', low: 'Fresh', high: 'Exhausted' },
  { key: 'stress', label: 'Stress', low: 'Relaxed', high: 'Very stressed' },
]

export function WellbeingSummary({ w }: { w: Wellbeing }) {
  const { settings } = useSettings()
  const score = wellnessScore(w)
  const chips: [string, string][] = []
  if (score != null) chips.push(['Wellness', `${score}/5`])
  if (w.sleepHours != null) chips.push(['Sleep', `${w.sleepHours}h`])
  if (w.restingHr != null) chips.push(['Resting HR', `${w.restingHr}`])
  if (w.hrv != null) chips.push(['HRV', `${w.hrv}ms`])
  if (w.weightKg != null) chips.push(['Weight', `${formatWeight(w.weightKg, settings.units)}${weightUnit(settings.units)}`])
  for (const s of [...GOOD, ...BAD]) if (w[s.key] != null) chips.push([s.label, `${w[s.key]}/5`])
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map(([k, v]) => (
          <span key={k} className="tabular rounded-lg bg-surface-2 px-2.5 py-1.5 text-sm">
            <span className="text-muted">{k}</span> <span className="font-semibold">{v}</span>
          </span>
        ))}
        {w.illness && <span className="rounded-lg bg-sport-run/15 px-2.5 py-1.5 text-sm font-semibold">Unwell</span>}
      </div>
      {w.injury && <p className="mt-2 text-sm"><span className="font-semibold">Injury / niggle:</span> {w.injury}</p>}
      {w.notes && <p className="mt-2 whitespace-pre-line text-sm text-muted">{w.notes}</p>}
    </div>
  )
}

export function WellbeingForm() {
  const { date = todayIso() } = useParams()
  const { wellbeing, saveWellbeing } = useLog()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const existing = wellbeing.find((w) => w.date === date)
  const [draft, setDraft] = useState<Draft>(existing ?? { date })
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    saveWellbeing(draft)
    navigate(`/log/wellbeing/${draft.date}`, { replace: true })
  }

  return (
    <form onSubmit={submit} className="space-y-5 pb-24">
      <PageHeader title="Daily check-in" subtitle="Takes 20 seconds. Tracked next to training to spot what affects performance." />

      <Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Field label="Date">
            <input
              type="date"
              className="tabular w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base md:py-2 md:text-sm"
              value={draft.date}
              disabled={!!existing}
              onChange={(e) => {
                const other = wellbeing.find((w) => w.date === e.target.value)
                setDraft(other ?? { ...draft, date: e.target.value })
              }}
            />
          </Field>
          <Field label="Sleep" unit="hours">
            <NumberInput value={draft.sleepHours} decimals={1} onChange={(sleepHours) => patch({ sleepHours })} placeholder="7.5" />
          </Field>
          <Field label="Resting HR" unit="bpm">
            <NumberInput integer value={draft.restingHr} onChange={(restingHr) => patch({ restingHr })} />
          </Field>
          <Field label="HRV" unit="ms">
            <NumberInput integer value={draft.hrv} onChange={(hrv) => patch({ hrv })} />
          </Field>
          <Field label="Body weight" unit={weightUnit(settings.units)}>
            <NumberInput value={draft.weightKg} factor={weightFactor(settings.units)} decimals={1} onChange={(weightKg) => patch({ weightKg })} />
          </Field>
        </div>
      </Card>

      <Card>
        <div className="grid gap-5 md:grid-cols-2">
          {[...GOOD, ...BAD].map((s) => (
            <Field key={s.key} label={s.label}>
              <Scale max={5} value={draft[s.key]} onChange={(v) => patch({ [s.key]: v })} low={s.low} high={s.high} />
            </Field>
          ))}
        </div>
        {wellnessScore(draft) != null && <p className="mt-4 text-sm text-muted">Wellness score {wellnessScore(draft)}/5 (average, with soreness, fatigue and stress flipped)</p>}
      </Card>

      <Card>
        <div className="space-y-4">
          <Toggle checked={!!draft.illness} onChange={(illness) => patch({ illness })} label="Feeling ill" />
          <Field label="Injury or niggle">
            <TextInput value={draft.injury} onChange={(injury) => patch({ injury })} placeholder="e.g. Left knee, sore going downstairs" />
          </Field>
          <Field label="Notes">
            <TextArea value={draft.notes} onChange={(notes) => patch({ notes })} placeholder="Work shift, travel, diet, anything else" />
          </Field>
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-2 md:px-4">
          <button type="button" onClick={() => navigate(-1)} className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">
            Cancel
          </button>
          <button type="submit" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90">
            Save check-in
          </button>
        </div>
      </div>
    </form>
  )
}

export function WellbeingDetail() {
  const { date } = useParams()
  const { wellbeing, sessions, deleteWellbeing } = useLog()
  const navigate = useNavigate()
  const w = wellbeing.find((x) => x.date === date)
  if (!w) return <Navigate to={`/log/wellbeing/${date}/edit`} replace />
  const sameDay = sortSessions(sessions.filter((s) => s.date === w.date)).reverse()

  return (
    <div className="space-y-5">
      <Link to="/log" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Log
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daily check-in</h1>
          <p className="text-sm text-muted">{formatDate(w.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex gap-2">
          <Link to={`/log/wellbeing/${w.date}/edit`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2">
            <Pencil className="size-4" /> Edit
          </Link>
          <button
            type="button"
            onClick={() => {
              if (!confirm('Delete this check-in?')) return
              deleteWellbeing(w.date)
              navigate('/log', { replace: true })
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-text"
          >
            <Trash2 className="size-4" /> Delete
          </button>
        </div>
      </div>
      <Card>
        <WellbeingSummary w={w} />
      </Card>
      <Card title="Training that day">
        {sameDay.length ? (
          <ul className="divide-y divide-line">
            {sameDay.map((s) => {
              const def = SPORTS[s.sport]
              return (
                <li key={s.id}>
                  <Link to={`/log/session/${s.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-accent-strong">
                    <def.icon className={`size-4 ${def.text}`} />
                    <span className="font-medium">{sessionName(s)}</span>
                    {s.rpe != null && <span className="text-muted">RPE {s.rpe}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing logged.</p>
        )}
      </Card>
    </div>
  )
}
