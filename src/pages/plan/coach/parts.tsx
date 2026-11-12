import { AlertTriangle, Info, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Field, FieldGroup, MultiChips, Scale, TextArea, TextInput, Toggle, inputClass } from '../../../components/fields'
import { chip } from '../../../components/styles'
import { formatTime } from '../../../log/format'
import { SPORTS } from '../../../log/sports'
import type { TrainingHistory, WorkPattern } from '../../../coach/history'
import { cap, injuryFlags, injuryTitle, type Flag } from '../../../coach/screening'
import type { Aggravator, BodyArea, Injury, InjuryStatus } from '../../../coach/types'
import { WEEKDAYS } from '../../../plan/dates'

// Pieces of the coach screening page: yes/no answers, flag notes, the injury editor and
// the read-only summaries worked out from the log and shifts.

export function YesNo({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <div className="flex shrink-0 gap-1.5">
      <button type="button" className={`${chip(value === true)} w-14`} onClick={() => onChange(true)}>
        Yes
      </button>
      <button type="button" className={`${chip(value === false)} w-14`} onClick={() => onChange(false)}>
        No
      </button>
    </div>
  )
}

/** A question with a yes/no answer on the right (below on a phone). */
export function Question({ text, value, onChange }: { text: string; value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <div role="group" aria-label={text} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm">{text}</span>
      <YesNo value={value} onChange={onChange} />
    </div>
  )
}

export function FlagNote({ flag }: { flag: Flag }) {
  const stop = flag.level === 'stop'
  const Icon = stop ? AlertTriangle : Info
  return (
    <p className={`flex gap-2 rounded-xl px-3 py-2.5 text-sm ${stop ? 'bg-miss/10 text-text' : 'bg-surface-2 text-text'}`}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${stop ? 'text-miss' : 'text-muted'}`} aria-label={stop ? 'See someone first' : 'Note'} />
      <span>{flag.text}</span>
    </p>
  )
}

const AREAS: BodyArea[] = ['foot', 'ankle', 'achilles', 'calf', 'shin', 'knee', 'hamstring', 'quad', 'hip', 'groin', 'lower back', 'upper back', 'neck', 'shoulder', 'elbow', 'wrist', 'rib', 'other']
const AGGRAVATORS: Aggravator[] = ['running', 'cycling', 'swimming', 'rowing', 'lifting', 'impact', 'hills', 'speed work', 'long sessions', 'sitting']
const STATUSES: { value: InjuryStatus; label: string }[] = [
  { value: 'current', label: 'Current' },
  { value: 'recovering', label: 'Getting better' },
  { value: 'past', label: 'Past, but worth knowing' },
]
const SEEN: { value: NonNullable<Injury['seenBy']>; label: string }[] = [
  { value: 'nobody', label: 'Nobody yet' },
  { value: 'physio', label: 'Physio' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'other', label: 'Someone else' },
]

export function InjuryEditor({ injury, onChange, onRemove }: { injury: Injury; onChange: (i: Injury) => void; onRemove: () => void }) {
  const patch = (p: Partial<Injury>) => onChange({ ...injury, ...p })
  const flags = injuryFlags(injury)
  const seen = injury.seenBy && injury.seenBy !== 'nobody'
  return (
    <div className="space-y-4 rounded-2xl border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">{injuryTitle(injury)}</h3>
        <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
          <Trash2 className="size-4" /> Remove
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Where">
          <select className={inputClass} value={injury.area} onChange={(e) => patch({ area: e.target.value as BodyArea })}>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {cap(a)}
              </option>
            ))}
          </select>
        </Field>
        <FieldGroup label="Side">
          <div className="flex flex-wrap gap-1.5">
            {(['left', 'right', 'both'] as const).map((s) => (
              <button key={s} type="button" className={chip(injury.side === s)} onClick={() => patch({ side: injury.side === s ? undefined : s })}>
                {cap(s)}
              </button>
            ))}
          </div>
        </FieldGroup>
      </div>
      <Field label="What it is or feels like">
        <TextInput value={injury.description} onChange={(description) => patch({ description })} placeholder="e.g. Ache below the kneecap after long runs" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldGroup label="Now">
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button key={s.value} type="button" className={chip(injury.status === s.value)} onClick={() => patch({ status: s.value })}>
                {s.label}
              </button>
            ))}
          </div>
        </FieldGroup>
        <Field label="Since (roughly)">
          <input type="date" className={inputClass} value={injury.since ?? ''} onChange={(e) => patch({ since: e.target.value || undefined })} />
        </Field>
      </div>
      {injury.status !== 'past' && (
        <>
          <FieldGroup label="Pain today, day to day">
            <Scale value={injury.painNow} onChange={(painNow) => patch({ painNow })} min={0} max={10} low="None" high="Worst" />
          </FieldGroup>
          <FieldGroup label="Pain during the training that hurts it most">
            <Scale value={injury.painInSport} onChange={(painInSport) => patch({ painInSport })} min={0} max={10} low="None" high="Worst" />
          </FieldGroup>
          <div className="divide-y divide-line">
            <Question text="Is it getting worse?" value={injury.worsening} onChange={(worsening) => patch({ worsening })} />
            <Question text="Does it hurt at rest?" value={injury.painAtRest} onChange={(painAtRest) => patch({ painAtRest })} />
            <Question text="Does it wake you at night?" value={injury.nightPain} onChange={(nightPain) => patch({ nightPain })} />
            <Question text="Any swelling, numbness, tingling, giving way or locking?" value={injury.otherSymptoms} onChange={(otherSymptoms) => patch({ otherSymptoms })} />
          </div>
        </>
      )}
      <FieldGroup label="What sets it off">
        <MultiChips value={injury.aggravatedBy} options={AGGRAVATORS} onChange={(v) => patch({ aggravatedBy: v as Aggravator[] })} />
      </FieldGroup>
      <FieldGroup label="Who has looked at it">
        <div className="flex flex-wrap gap-1.5">
          {SEEN.map((s) => (
            <button key={s.value} type="button" className={chip(injury.seenBy === s.value)} onClick={() => patch({ seenBy: s.value, cleared: s.value === 'nobody' ? undefined : injury.cleared })}>
              {s.label}
            </button>
          ))}
        </div>
      </FieldGroup>
      {seen && (
        <>
          <Toggle checked={!!injury.cleared} onChange={(cleared) => patch({ cleared })} label="Cleared to train fully" />
          <Field label="What they said to do or avoid">
            <TextArea value={injury.advice} onChange={(advice) => patch({ advice })} rows={2} placeholder="e.g. No hills for 4 weeks, calf raises daily" />
          </Field>
        </>
      )}
      {flags.map((f) => (
        <FlagNote key={f.text} flag={f} />
      ))}
    </div>
  )
}

const h1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-GB')
const date = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="tabular text-right font-medium">{children}</span>
    </div>
  )
}

export function HistorySummary({ h }: { h: TrainingHistory }) {
  if (!h.activeWeeks)
    return (
      <p className="text-sm text-muted">
        Nothing logged between {date(h.from)} and {date(h.to)}. Log sessions or connect Strava (Log › Strava) and this fills itself in; otherwise describe your recent training below.
      </p>
    )
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        From your log, {date(h.from)} – {date(h.to)} ({h.weeks} weeks){h.firstLog && h.firstLog < h.from ? `. Records go back to ${date(h.firstLog)}` : ''}.
      </p>
      <div className="divide-y divide-line">
        <Line label="Training per week">
          {h1(h.hoursPerWeek)}h avg · {h1(h.recentHoursPerWeek)}h last 4 weeks · {h1(h.maxWeekHours)}h biggest
        </Line>
        <Line label="Days a week">{h1(h.daysPerWeek)}</Line>
        <Line label="Weeks with training">
          {h.activeWeeks} of {h.weeks}
        </Line>
        {h.multisport > 0 && <Line label="Bricks and multisport">{h.multisport}</Line>}
        {h.load && (
          <Line label="Fitness · fatigue · form">
            {Math.round(h.load.fitness)} · {Math.round(h.load.fatigue)} · {h.load.form >= 0 ? '+' : ''}
            {Math.round(h.load.form)}
          </Line>
        )}
        {h.checkins && (
          <Line label={`Check-ins, last 4 weeks (${h.checkins.count})`}>
            {[h.checkins.sleepHours && `${h1(h.checkins.sleepHours)}h sleep`, h.checkins.restingHr && `RHR ${Math.round(h.checkins.restingHr)}`, h.checkins.hrv && `HRV ${Math.round(h.checkins.hrv)}`]
              .filter(Boolean)
              .join(' · ') || '—'}
          </Line>
        )}
      </div>
      <div>
        <h4 className="mb-1 text-xs font-medium text-muted">By sport, per week</h4>
        <ul className="divide-y divide-line">
          {h.sports.map((s) => {
            const def = SPORTS[s.sport]
            const Icon = def.icon
            return (
              <li key={s.sport} className="flex items-center gap-3 py-2 text-sm">
                <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${def.soft} ${def.text}`}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{def.label}</span>
                  <span className="block text-xs text-muted">
                    Longest {s.longestSec ? formatTime(s.longestSec, false) : '—'}
                    {s.longestM ? ` · furthest ${h1(s.longestM / 1000)}km` : ''}
                  </span>
                </span>
                <span className="tabular shrink-0 text-right">
                  {h1(s.sessionsPerWeek)}× · {h1(s.hoursPerWeek)}h{s.kmPerWeek ? ` · ${h1(s.kmPerWeek)}km` : ''}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
      {h.missingRpe > 0 && <p className="text-xs text-muted">{h.missingRpe} session{h.missingRpe === 1 ? ' has' : 's have'} no RPE, so the fitness numbers undercount.</p>}
      {(h.niggleSessions > 0 || h.injuryNotes.length > 0) && (
        <p className="text-xs text-muted">
          Your log mentions {[h.niggleSessions && `${h.niggleSessions} session${h.niggleSessions === 1 ? '' : 's'} tagged Niggle or Sore`, h.injuryNotes.length && `injuries in check-ins (${h.injuryNotes.join('; ')})`].filter(Boolean).join(' and ')}: add
          them under Injuries & niggles if they still matter.
        </p>
      )}
    </div>
  )
}

export function WorkSummary({ w }: { w: WorkPattern }) {
  if (w.source === 'none') return <p className="text-sm text-muted">No shifts added yet. Add them on Plan › Work & calendar and the plan fits around them.</p>
  const days = w.days.filter((d) => d.share > 0)
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        From your shifts, {w.source === 'ahead' ? 'the next' : 'the last'} {w.weeks} weeks.
      </p>
      <div className="divide-y divide-line">
        <Line label="Work per week">
          {h1(w.hoursPerWeek)}h · {h1(w.shiftsPerWeek)} shifts · {h1(w.daysOffPerWeek)} days off
        </Line>
        {days.map((d) => (
          <Line key={d.day} label={WEEKDAYS[d.day]}>
            {d.share >= 1 ? 'Every week' : `${Math.round(d.share * w.weeks)} of ${w.weeks} weeks`}
            {d.start && ` · usually ${d.start}–${d.end}`}
          </Line>
        ))}
        {(w.earlyStarts > 0 || w.lateFinishes > 0 || w.nights > 0) && (
          <Line label="Awkward shifts">{[w.earlyStarts && `${w.earlyStarts} early`, w.lateFinishes && `${w.lateFinishes} late`, w.nights && `${w.nights} night`].filter(Boolean).join(' · ')}</Line>
        )}
      </div>
    </div>
  )
}
