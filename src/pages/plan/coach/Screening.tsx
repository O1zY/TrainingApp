import { ArrowLeft, Check, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Field, FieldGroup, MultiChips, NumberInput, Section, TextArea, TimeInput, Toggle, inputClass } from '../../../components/fields'
import { chip } from '../../../components/styles'
import { Card, PageHeader } from '../../../components/ui'
import { trainingHistory, workPattern } from '../../../coach/history'
import { FORMAT_LABEL, blankLegs, formatsFor, presetLegs } from '../../../coach/races'
import { HEALTH_QUESTIONS, SECTIONS, allFlags, healthFlags, injuryTitle, progress, type SectionKey } from '../../../coach/screening'
import { EMPTY_PROFILE, type AthleteProfile, type Equipment, type Experience, type Injury, type RaceAim, type SwimLevel } from '../../../coach/types'
import { distanceFactor, distanceUnit, formatDate, newId, todayIso } from '../../../log/format'
import { useLog } from '../../../log/LogStore'
import { SPORTS } from '../../../log/sports'
import type { Sport } from '../../../log/types'
import { WEEKDAYS } from '../../../plan/dates'
import { raceLabel } from '../../../plan/events'
import { usePlan } from '../../../plan/PlanStore'
import { useSettings } from '../../../settings/SettingsContext'
import { FlagNote, HistorySummary, InjuryEditor, Question, WorkSummary } from './parts'

// Plan › Coach screening (section 11a): everything the coach needs before it builds a
// plan. What the app already knows (training history, work pattern) is shown to check,
// not asked for; the rest is asked once and kept as the athlete profile.

const AIMS: { value: RaceAim; label: string }[] = [
  { value: 'finish', label: 'Finish strong' },
  { value: 'pb', label: 'Personal best' },
  { value: 'qualify', label: 'Qualify' },
  { value: 'place', label: 'Place / podium' },
]
const EXPERIENCE: { value: Experience; label: string }[] = [
  { value: 'first', label: 'First one' },
  { value: 'some', label: 'Done a few' },
  { value: 'experienced', label: 'Experienced' },
]
const SWIM: { value: SwimLevel; label: string }[] = [
  { value: 'none', label: 'Can’t swim front crawl yet' },
  { value: 'learning', label: 'Learning, need rests' },
  { value: 'continuous', label: 'Can swim the distance' },
  { value: 'confident', label: 'Confident, swim regularly' },
]
const EQUIPMENT: Equipment[] = ['road bike', 'TT bike', 'turbo trainer', 'smart trainer', 'power meter', 'HR strap', 'GPS watch', 'treadmill', 'rowing machine', 'gym', 'pool', 'open water', 'track']
const KEEP_SPORTS: Sport[] = ['row', 'erg', 'strength', 'swim', 'bike', 'run', 'other']
const DAYS = [1, 2, 3, 4, 5, 6, 0]

const pick = <T extends string>(value: T | undefined, options: { value: T; label: string }[], onChange: (v: T) => void) => (
  <div className="flex flex-wrap gap-1.5">
    {options.map((o) => (
      <button key={o.value} type="button" className={chip(value === o.value)} onClick={() => onChange(o.value)}>
        {o.label}
      </button>
    ))}
  </div>
)

export default function Screening() {
  const { profile: saved, saveProfile, events, commitments, prefs } = usePlan()
  const { sessions, wellbeing } = useLog()
  const { settings } = useSettings()
  const today = todayIso()
  const [draft, setDraft] = useState<AthleteProfile>(() => saved ?? EMPTY_PROFILE)
  const [justSaved, setJustSaved] = useState(false)
  const patch = (p: Partial<AthleteProfile>) => {
    setJustSaved(false)
    setDraft((d) => ({ ...d, ...p }))
  }

  const history = useMemo(() => trainingHistory(sessions, wellbeing, today, settings.weekStartsOn), [sessions, wellbeing, today, settings.weekStartsOn])
  const work = useMemo(() => workPattern(commitments, prefs, today, settings.weekStartsOn), [commitments, prefs, today, settings.weekStartsOn])

  const { updatedAt: _a, ...draftBody } = draft
  const { updatedAt: _b, ...savedBody } = saved ?? EMPTY_PROFILE
  const dirty = JSON.stringify(draftBody) !== JSON.stringify(savedBody)
  const prog = progress(draft, events, today)
  const flags = allFlags(draft)
  const races = events.filter((e) => e.kind === 'race' && (e.date >= today || e.id === draft.goal.eventId))
  const race = events.find((e) => e.id === draft.goal.eventId)
  const firstOpen = SECTIONS.find((s) => prog.missing[s.key].length)?.key

  const summary = (key: SectionKey) => (prog.missing[key].length ? `To do: ${prog.missing[key].join(', ')}` : 'Done')
  const title = (key: SectionKey) => {
    const done = !prog.missing[key].length
    return (
      <span className="flex items-center gap-2">
        <span className={`grid size-5 place-items-center rounded-full ${done ? 'bg-accent text-on-accent' : 'border border-line'}`}>{done && <Check className="size-3.5" />}</span>
        {SECTIONS.find((s) => s.key === key)!.title}
      </span>
    )
  }

  const goal = draft.goal
  const setGoal = (p: Partial<AthleteProfile['goal']>) => patch({ goal: { ...goal, ...p } })
  const setInjury = (i: Injury) => patch({ injuries: draft.injuries.map((x) => (x.id === i.id ? { ...i, updatedAt: new Date().toISOString() } : x)) })
  const av = draft.availability
  const setAv = (p: Partial<AthleteProfile['availability']>) => patch({ availability: { ...av, ...p } })

  const save = () => {
    const { updatedAt: _u, ...rest } = draft
    saveProfile(rest)
    setJustSaved(true)
  }

  return (
    <div className="space-y-5">
      <Link to="/plan" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Plan
      </Link>
      <PageHeader title="Coach screening" subtitle="What the coach needs to know before building your plan. Anything your log and shifts already show is filled in for you to check." />

      <Card className="max-w-3xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">
              {prog.done} of {prog.total} sections done
            </div>
            <p className="text-sm text-muted">{prog.complete ? 'Ready for the coach.' : 'The coach can build a plan once every section is done.'}</p>
          </div>
          <div className="flex gap-1" aria-hidden>
            {SECTIONS.map((s) => (
              <span key={s.key} className={`h-2 w-5 rounded-full ${prog.missing[s.key].length ? 'bg-surface-2' : 'bg-accent'}`} />
            ))}
          </div>
        </div>
        {flags.length > 0 && (
          <div className="mt-4 space-y-2">
            {flags.map((f) => (
              <FlagNote key={f.text} flag={f} />
            ))}
          </div>
        )}
      </Card>

      <div className="max-w-3xl space-y-3">
        <Section title={title('goal')} summary={summary('goal')} defaultOpen={firstOpen === 'goal'}>
          <div className="space-y-4">
            <Field label="Race" hint={race ? [formatDate(race.date), raceLabel(race), race.priority && `${race.priority} race`].filter(Boolean).join(' · ') : undefined}>
              <select
                className={inputClass}
                value={goal.eventId ?? ''}
                onChange={(e) => {
                  const r = events.find((x) => x.id === e.target.value)
                  setGoal({ eventId: r?.id, format: undefined, legs: r ? blankLegs(r.multisport, r.sport) : [] })
                }}
              >
                <option value="">Pick a race…</option>
                {races.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {formatDate(r.date)}
                  </option>
                ))}
              </select>
            </Field>
            <Link to="/plan/events/new" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong">
              <Plus className="size-4" /> Add a race to Races & events
            </Link>
            {race && formatsFor(race.multisport).length > 0 && (
              <FieldGroup label="Format">
                {pick(goal.format, formatsFor(race.multisport).map((f) => ({ value: f, label: FORMAT_LABEL[f] })), (format) =>
                  setGoal({ format, legs: presetLegs(race.multisport, format) ?? goal.legs.map((l) => ({ ...l, distanceM: 0 })) }),
                )}
              </FieldGroup>
            )}
            {goal.legs.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-3">
                {goal.legs.map((leg, i) => {
                  const unit = distanceUnit(leg.sport, settings.units)
                  return (
                    <Field key={i} label={`${i + 1}. ${SPORTS[leg.sport].label}`} unit={unit}>
                      <NumberInput
                        value={leg.distanceM || undefined}
                        factor={distanceFactor(unit)}
                        decimals={unit === 'm' ? 0 : 2}
                        onChange={(v) => setGoal({ legs: goal.legs.map((l, j) => (j === i ? { ...l, distanceM: v ?? 0 } : l)) })}
                      />
                    </Field>
                  )
                })}
              </div>
            )}
            <FieldGroup label="Aiming to">{pick(goal.aim, AIMS, (aim) => setGoal({ aim }))}</FieldGroup>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Target time (optional)">
                <TimeInput value={goal.targetSec} onChange={(targetSec) => setGoal({ targetSec })} placeholder="h:mm:ss" />
              </Field>
            </div>
            <Field label="More about the aim (optional)">
              <TextArea value={goal.aimNotes} onChange={(aimNotes) => setGoal({ aimNotes })} rows={2} placeholder="e.g. Top 4 in my age group to qualify for the GB age-group team" />
            </Field>
            <FieldGroup label="Raced this kind of event before?">{pick(goal.experience, EXPERIENCE, (experience) => setGoal({ experience }))}</FieldGroup>
          </div>
        </Section>

        <Section title={title('health')} summary={summary('health')} defaultOpen={firstOpen === 'health'}>
          <p className="mb-2 text-sm text-muted">The standard questions asked before any new exercise programme. A yes doesn’t stop you training; it means checking with your GP before hard sessions.</p>
          <div className="divide-y divide-line">
            {HEALTH_QUESTIONS.map((q) => (
              <Question key={q.key} text={q.text} value={draft.health[q.key]} onChange={(v) => patch({ health: { ...draft.health, [q.key]: v } })} />
            ))}
            <Question text="Have you been ill (a cold, a virus) in the last two weeks?" value={draft.health.recentIllness} onChange={(recentIllness) => patch({ health: { ...draft.health, recentIllness } })} />
          </div>
          <Field label="Anything to add (optional)" className="mt-3">
            <TextArea value={draft.health.notes} onChange={(notes) => patch({ health: { ...draft.health, notes } })} rows={2} />
          </Field>
          <div className="mt-3 space-y-2">
            {healthFlags(draft.health).map((f) => (
              <FlagNote key={f.text} flag={f} />
            ))}
          </div>
        </Section>

        <Section
          title={title('injuries')}
          summary={draft.injuries.length ? `${draft.injuries.map(injuryTitle).join(', ')}${prog.missing.injuries.length ? ' · to confirm' : ''}` : summary('injuries')}
          defaultOpen={firstOpen === 'injuries'}
        >
          <div className="space-y-3">
            <p className="text-sm text-muted">Anything current, getting better, or past but likely to come back. The coach plans around niggles; anything more needs a physio first.</p>
            {draft.injuries.map((i) => (
              <InjuryEditor key={i.id} injury={i} onChange={setInjury} onRemove={() => patch({ injuries: draft.injuries.filter((x) => x.id !== i.id) })} />
            ))}
            <button
              type="button"
              onClick={() => patch({ injuriesChecked: false, injuries: [...draft.injuries, { id: newId(), area: 'knee', status: 'current', aggravatedBy: [], updatedAt: new Date().toISOString() }] })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2"
            >
              <Plus className="size-4" /> Add injury or niggle
            </button>
            <div>
              <Toggle
                checked={!!draft.injuriesChecked}
                onChange={(injuriesChecked) => patch({ injuriesChecked })}
                label={draft.injuries.length ? 'That’s everything' : 'No injuries or niggles'}
              />
            </div>
          </div>
        </Section>

        <Section title={title('history')} summary={summary('history')} defaultOpen={firstOpen === 'history'}>
          <div className="space-y-4">
            <HistorySummary h={history} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Years of regular endurance training">
                <NumberInput value={draft.trainingYears} onChange={(trainingYears) => patch({ trainingYears })} decimals={1} />
              </Field>
            </div>
            {(goal.legs.some((l) => l.sport === 'swim') || draft.swimLevel) && <FieldGroup label="Swimming">{pick(draft.swimLevel, SWIM, (swimLevel) => patch({ swimLevel }))}</FieldGroup>}
            <Field label="Anything the log doesn’t show (optional)" hint="Training you didn’t log, time off, a club squad, how the last race went.">
              <TextArea value={draft.historyNotes} onChange={(historyNotes) => patch({ historyNotes })} rows={3} />
            </Field>
            <Toggle checked={!!draft.historyChecked} onChange={(historyChecked) => patch({ historyChecked })} label="This is a fair picture of my training" />
          </div>
        </Section>

        <Section title={title('availability')} summary={summary('availability')} defaultOpen={firstOpen === 'availability'}>
          <div className="space-y-4">
            <WorkSummary w={work} />
            <Link to="/plan/work" className="inline-block text-sm font-medium text-accent-strong">
              Edit shifts on Work & calendar
            </Link>
            <FieldGroup label="Most training days a week">
              <div className="flex flex-wrap gap-1.5">
                {[3, 4, 5, 6, 7].map((n) => (
                  <button key={n} type="button" className={chip(av.daysPerWeek === n)} onClick={() => setAv({ daysPerWeek: n })}>
                    {n}
                  </button>
                ))}
              </div>
            </FieldGroup>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Most hours a week">
                <NumberInput value={av.hoursPerWeek} onChange={(hoursPerWeek) => setAv({ hoursPerWeek })} decimals={1} />
              </Field>
              <Field label="Longest session on a work day" unit="min">
                <NumberInput value={av.weekdayMaxMin} onChange={(weekdayMaxMin) => setAv({ weekdayMaxMin })} integer />
              </Field>
              <Field label="Longest session on a day off" unit="min">
                <NumberInput value={av.dayOffMaxMin} onChange={(dayOffMaxMin) => setAv({ dayOffMaxMin })} integer />
              </Field>
            </div>
            <FieldGroup label="Rest day">
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className={chip(av.restDay == null)} onClick={() => setAv({ restDay: undefined })}>
                  Any
                </button>
                {DAYS.map((d) => (
                  <button key={d} type="button" className={chip(av.restDay === d)} onClick={() => setAv({ restDay: d })}>
                    {WEEKDAYS[d].slice(0, 3)}
                  </button>
                ))}
              </div>
            </FieldGroup>
            <Toggle checked={!!av.doubles} onChange={(doubles) => setAv({ doubles })} label="Two sessions in a day are fine" />
            <FieldGroup label="Other training to keep up" hint="Sessions a week to keep alongside the race plan, e.g. rowing or lifting.">
              <div className="space-y-2">
                <MultiChips
                  value={draft.keep.map((k) => SPORTS[k.sport].label)}
                  options={KEEP_SPORTS.map((s) => SPORTS[s].label)}
                  onChange={(labels) => {
                    const chosen = KEEP_SPORTS.filter((s) => labels.includes(SPORTS[s].label))
                    patch({ keep: chosen.map((sport) => draft.keep.find((k) => k.sport === sport) ?? { sport, sessions: 1 }) })
                  }}
                />
                {draft.keep.map((k) => (
                  <div key={k.sport} className="flex items-center gap-3 text-sm">
                    <span className="w-28">{SPORTS[k.sport].label}</span>
                    <div className="w-24">
                      <NumberInput
                        aria-label={`${SPORTS[k.sport].label} sessions a week`}
                        value={k.sessions}
                        integer
                        onChange={(v) => patch({ keep: draft.keep.map((x) => (x.sport === k.sport ? { ...x, sessions: v ?? 0 } : x)) })}
                      />
                    </div>
                    <span className="text-muted">a week</span>
                  </div>
                ))}
              </div>
            </FieldGroup>
            <Field label="Anything else about your time (optional)">
              <TextArea value={av.notes} onChange={(notes) => setAv({ notes })} rows={2} placeholder="e.g. Rota changes weekly; Sunday mornings are club rides" />
            </Field>
          </div>
        </Section>

        <Section title={title('equipment')} summary={summary('equipment')} defaultOpen={firstOpen === 'equipment'}>
          <div className="space-y-4">
            <FieldGroup label="What you have or can get to">
              <MultiChips value={draft.equipment} options={EQUIPMENT} onChange={(v) => patch({ equipment: v as Equipment[] })} />
            </FieldGroup>
            <Field label="Anything else the coach should know (optional)">
              <TextArea value={draft.notes} onChange={(notes) => patch({ notes })} rows={3} placeholder="Sessions you love or hate, club sessions, how you respond to hard weeks" />
            </Field>
          </div>
        </Section>
      </div>

      <div className={`${dirty ? 'sticky bottom-24 shadow-lg md:bottom-4' : ''} z-10 max-w-3xl rounded-2xl border border-line bg-surface/95 px-4 py-3 backdrop-blur`}>
        <div className="flex items-center justify-end gap-3">
          <span className="text-sm text-muted">{dirty ? 'Unsaved changes' : justSaved ? 'Saved' : saved ? `Saved ${formatDate(saved.updatedAt.slice(0, 10))}` : 'Not saved yet'}</span>
          <button type="button" disabled={!dirty} onClick={save} className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90 disabled:opacity-40">
            Save screening
          </button>
        </div>
      </div>
    </div>
  )
}
