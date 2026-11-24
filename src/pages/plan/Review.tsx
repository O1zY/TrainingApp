import { ArrowLeft, Check, CloudDownload, Flag } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { FINDINGS } from '../../coach/evidence'
import { injuryTitle } from '../../coach/screening'
import { EMPTY_PROFILE, type Injury } from '../../coach/types'
import { Field, Scale, TextArea, inputClass } from '../../components/fields'
import { Card, PageHeader, StatTile } from '../../components/ui'
import { formatDate, formatTime, newId, todayIso } from '../../log/format'
import { useLog } from '../../log/LogStore'
import { SPORTS } from '../../log/sports'
import { blockWeeks } from '../../plan/cycle'
import { addDays, weekDates, weekStart } from '../../plan/dates'
import { dayLoad, weekWork } from '../../plan/load'
import { blockEnd, useReplan } from '../../plan/planned'
import { usePlan } from '../../plan/PlanStore'
import type { EventKind, ReviewProposal } from '../../plan/types'
import { applyProposals } from '../../review/apply'
import { reviewRules, type NiggleAnswer } from '../../review/rules'
import { snapshotOf, summariseWeek, type Outcome, type WeekSummary } from '../../review/summary'
import { useSettings } from '../../settings/SettingsContext'
import { useStrava } from '../../strava/StravaStore'
import { InjuryEditor, YesNo } from './coach/parts'

const findingTitle = new Map(FINDINGS.map((f) => [f.id, f.title]))
const short = (iso: string) => formatDate(iso, { day: 'numeric', month: 'short' })
const hours = (sec: number) => `${(sec / 3600).toFixed(1)}h`

const OUTCOME: Record<Outcome, { label: string; className: string }> = {
  done: { label: 'Done', className: 'bg-hit/15 text-hit' },
  moved: { label: 'Moved', className: 'bg-hit/15 text-hit' },
  skipped: { label: 'Skipped', className: 'bg-surface-2 text-muted' },
  missed: { label: 'Missed', className: 'bg-miss/15 text-miss' },
  upcoming: { label: 'To come', className: 'bg-surface-2 text-muted' },
}

const FELT = ['', 'Awful', 'Rough', 'OK', 'Good', 'Great']

function WeekCard({ s }: { s: WeekSummary }) {
  return (
    <Card title="The week">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Sessions done" value={`${s.results.filter((r) => r.logged).length}/${s.results.length}`} />
        <StatTile label="Time done" value={hours(s.doneSec)} unit={`of ${hours(s.plannedSec)}`} />
        <StatTile label="Key sessions" value={`${s.keyDone}/${s.keyDue}`} />
        <StatTile label="Load" value={String(Math.round(s.load))} />
      </div>
      <ul className="mt-4 divide-y divide-line">
        {s.results.map((r) => {
          const def = SPORTS[r.planned.sport]
          const t = s.keyTargets.find((k) => k.result === r)
          return (
            <li key={r.planned.id} className="flex items-center gap-3 py-2 text-sm">
              <def.icon className={`size-4 shrink-0 ${def.text}`} />
              <span className="w-20 shrink-0 text-muted">{formatDate(r.planned.date, { weekday: 'short', day: 'numeric' })}</span>
              <span className="min-w-0 flex-1 truncate">
                <Link to={r.logged ? `/log/session/${r.logged.id}` : `/plan/session/${r.planned.id}`} className="font-medium hover:underline">
                  {r.planned.title}
                </Link>
                {r.planned.intensity === 'key' && <span className="ml-1.5 text-xs text-muted">key</span>}
                {t && (
                  <span className="ml-1.5 text-xs text-muted">
                    · {t.hit}/{t.targeted} reps on target
                  </span>
                )}
                {r.outcome === 'moved' && <span className="ml-1.5 text-xs text-muted">· done {short(r.logged!.date)}</span>}
              </span>
              {r.logged?.durationSec != null && <span className="tabular hidden text-muted sm:inline">{formatTime(r.logged.durationSec, false)}</span>}
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${OUTCOME[r.outcome].className}`}>{OUTCOME[r.outcome].label}</span>
            </li>
          )
        })}
      </ul>
      {s.extraSec > 0 && <p className="mt-2 text-sm text-muted">Plus {hours(s.extraSec)} of training that wasn’t in the plan.</p>}
    </Card>
  )
}

function HowYouWereCard({ s }: { s: WeekSummary }) {
  const ratio = s.ratio
  return (
    <Card title="How you were">
      <ul className="space-y-1.5 text-sm">
        <li>
          {s.checkins.length ? (
            <>
              <span className="font-semibold">{s.checkins.length}</span> check-in{s.checkins.length === 1 ? '' : 's'}
              {s.lowDays.length ? (
                <>
                  , <span className="font-semibold">{s.lowDays.length}</span> worse than your {s.baseline === 'own' ? 'usual (last 4 weeks)' : 'healthy range'}:{' '}
                  {s.lowDays.map((d) => `${formatDate(d.date, { weekday: 'short' })} ${d.reasons.join(', ')}`).join(' · ')}
                </>
              ) : (
                ', none of them off your usual.'
              )}
            </>
          ) : (
            <span className="text-muted">No check-ins this week, so sleep and tiredness can’t be taken into account.</span>
          )}
        </li>
        {s.illDays.length > 0 && <li>Ill on {s.illDays.map((d) => formatDate(d, { weekday: 'long' })).join(', ')}.</li>}
        {s.injuryNotes.length > 0 && <li>Niggles noted: {s.injuryNotes.join('; ')}.</li>}
        {s.rpeHigh.length > 0 && <li>Easy sessions that felt hard: {s.rpeHigh.map((r) => `${r.planned.title} (RPE ${r.logged!.rpe}, planned ${r.plannedRpe})`).join(', ')}.</li>}
        <li className="text-muted">
          Fitness {Math.round(s.fitness)}, fatigue {Math.round(s.fatigue)}, form {Math.round(s.fitness - s.fatigue)}
          {ratio != null && ` · acute:chronic ${ratio.toFixed(2)}, shown for information only`}
        </li>
      </ul>
    </Card>
  )
}

function ProposalRow({ p, checked, onToggle }: { p: ReviewProposal; checked: boolean; onToggle: () => void }) {
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      {p.change ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={p.title}
          onClick={onToggle}
          className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${checked ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface'}`}
        >
          {checked && <Check className="size-3.5" />}
        </button>
      ) : (
        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{p.title}</p>
        <p className="mt-0.5 text-sm text-muted">{p.reason}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {p.findings.map((id) => (
            <Link key={id} to={`/plan/coach/research#${id}`} className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-strong hover:underline">
              {findingTitle.get(id) ?? id}
            </Link>
          ))}
          {p.judgement && <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">Coach’s judgement</span>}
          {p.link && (
            <Link to={p.link.to} className="rounded-full border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2">
              {p.link.label} →
            </Link>
          )}
          {!p.change && !p.link && <span className="px-1 py-1 text-xs text-muted">Nothing to change</span>}
        </div>
      </div>
    </li>
  )
}

const newInjury = (): Injury => ({ id: newId(), area: 'knee', status: 'current', aggravatedBy: [], updatedAt: new Date().toISOString() })

export default function Review() {
  const { week: param } = useParams()
  const navigate = useNavigate()
  const { settings } = useSettings()
  const { sessions, wellbeing, workouts } = useLog()
  const plan = usePlan()
  const { blocks, planned, events, commitments, prefs, profile, reviews } = plan
  const strava = useStrava()
  const replan = useReplan()
  const start = param ? weekStart(param, settings.weekStartsOn) : undefined
  const existing = reviews.find((r) => r.weekStart === start)

  const [felt, setFelt] = useState<number | undefined>(existing?.felt)
  const [note, setNote] = useState<string | undefined>(existing?.note)
  const [hasNiggle, setHasNiggle] = useState(false)
  const [niggle, setNiggle] = useState<Injury | undefined>()
  const [settled, setSettled] = useState<boolean | undefined>()
  const [coming, setComing] = useState<{ kind: EventKind; name?: string; date?: string; endDate?: string }>({ kind: 'away' })
  const [unticked, setUnticked] = useState<Set<string>>(new Set())

  if (!start) return <Navigate to="/plan" replace />

  const block = blocks.find((b) => b.start <= addDays(start, 6) && blockEnd(b) >= start)
  const weeks = block ? blockWeeks(block, events) : []
  const summary = summariseWeek({ start, planned, sessions, wellbeing, workouts })
  const previous = summariseWeek({ start: addDays(start, -7), planned, sessions, wellbeing, workouts })
  const workHours = (ws: string) => weekWork(weekDates(ws).map((d) => dayLoad(d, commitments, prefs))).hours
  const work = { next: workHours(addDays(start, 7)), recent: [0, 7, 14, 21].map((d) => workHours(addDays(start, -d))) }

  const current = (profile?.injuries ?? []).filter((i) => i.status !== 'past')
  const injuries = niggle ? [...(profile?.injuries ?? []).filter((i) => i.id !== niggle.id), niggle] : (profile?.injuries ?? [])
  const answer: NiggleAnswer | undefined = hasNiggle && niggle ? { injury: niggle, settled } : undefined
  const proposals = reviewRules({ summary, previous: previous.results.length ? previous : undefined, block, weeks, planned, injuries, niggle: answer, work, today: todayIso() })
  const accepted = proposals.filter((p) => p.change && !unticked.has(p.id))
  const ended = addDays(start, 6) < todayIso()
  const stravaBehind = strava.connected && (strava.review.length > 0 || !strava.lastSync || strava.lastSync.slice(0, 10) < addDays(start, 6))

  const save = () => {
    if (hasNiggle && niggle) plan.saveProfile({ ...(profile ?? EMPTY_PROFILE), injuries: injuries.map((i) => (i.id === niggle.id ? { ...i, updatedAt: new Date().toISOString() } : i)) })
    if (coming.name?.trim() && coming.date) plan.saveEvent({ kind: coming.kind, name: coming.name.trim(), date: coming.date, endDate: coming.endDate && coming.endDate > coming.date ? coming.endDate : undefined })

    const applied = applyProposals(accepted, block, planned)
    for (const s of applied.sessions) plan.savePlanned(s)
    if (applied.block && applied.block !== block) {
      const saved = plan.saveBlock(applied.block)
      const fresh = planned.map((p) => applied.sessions.find((s) => s.id === p.id) ?? p)
      replan({ blocks: [saved], planned: fresh })
    }
    plan.saveReview({
      weekStart: start,
      blockId: block?.id,
      status: 'done',
      felt,
      injuryId: hasNiggle ? niggle?.id : undefined,
      note: note?.trim() || undefined,
      snapshot: snapshotOf(summary),
      proposals,
      accepted: accepted.map((p) => p.id),
    })
    navigate(`/plan?week=${addDays(start, 7)}&reviewed=1`)
  }

  const skip = () => {
    plan.saveReview({ weekStart: start, blockId: block?.id, status: 'skipped', proposals: [], accepted: [] })
    navigate('/plan')
  }

  return (
    <div className="space-y-5">
      <Link to={`/plan?week=${start}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Plan
      </Link>
      <PageHeader
        title="Review your week"
        subtitle={`${formatDate(start, { day: 'numeric', month: 'short' })} – ${formatDate(addDays(start, 6), { day: 'numeric', month: 'short' })}${block ? ` · ${block.name}` : ''}`}
      />

      {existing && (
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
          {existing.status === 'skipped' ? 'You skipped this review' : 'Reviewed'} on {short(existing.updatedAt.slice(0, 10))}
          {existing.status === 'done' && `: ${existing.accepted.length} change${existing.accepted.length === 1 ? '' : 's'} accepted`}. Saving again applies today’s answers on top.
        </p>
      )}
      {!ended && <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm">This week isn’t over yet: sessions still to come count as not done.</p>}
      {stravaBehind && (
        <Link to="/log/strava" className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm hover:bg-surface-2">
          <CloudDownload className="size-4 shrink-0 text-accent-strong" />
          <span>
            <span className="font-semibold">Bring in Strava first</span>
            <span className="text-muted"> {strava.review.length ? `${strava.review.length} activit${strava.review.length === 1 ? 'y is' : 'ies are'} waiting to be matched` : 'It hasn’t synced since the week ended'}, so the week may be incomplete.</span>
          </span>
        </Link>
      )}

      <WeekCard s={summary} />
      <HowYouWereCard s={summary} />

      <Card title="Your answers">
        <div className="space-y-5">
          <Field label="How did the week feel?">
            <Scale value={felt} onChange={setFelt} min={1} max={5} low="Awful" high="Great" describe={(v) => FELT[v]} />
          </Field>

          <div>
            <p className="mb-1.5 text-sm font-medium">Any niggle that’s new or getting worse?</p>
            <YesNo
              value={hasNiggle}
              onChange={(v) => {
                setHasNiggle(v)
                if (v && !niggle) setNiggle(current[0] ? { ...current[0] } : newInjury())
              }}
            />
            {hasNiggle && niggle && (
              <div className="mt-3 space-y-3">
                {current.length > 0 && (
                  <Field label="Which one">
                    <select
                      className={inputClass}
                      value={current.some((i) => i.id === niggle.id) ? niggle.id : 'new'}
                      onChange={(e) => setNiggle(e.target.value === 'new' ? newInjury() : { ...current.find((i) => i.id === e.target.value)! })}
                    >
                      {current.map((i) => (
                        <option key={i.id} value={i.id}>
                          {injuryTitle(i)}
                        </option>
                      ))}
                      <option value="new">Something new</option>
                    </select>
                  </Field>
                )}
                <div>
                  <p className="mb-1.5 text-sm font-medium">After training, had it settled by the next morning?</p>
                  <YesNo value={settled} onChange={setSettled} />
                </div>
                <InjuryEditor injury={niggle} onChange={setNiggle} onRemove={() => (setHasNiggle(false), setNiggle(undefined))} />
                <p className="text-xs text-muted">Saved to your coach screening, so the coach and next week’s review both take it into account.</p>
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <Flag className="size-4 text-muted" /> Anything coming up? <span className="font-normal text-muted">(optional)</span>
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[8rem_1fr_1fr_1fr]">
              <select aria-label="Kind" className={inputClass} value={coming.kind} onChange={(e) => setComing({ ...coming, kind: e.target.value as EventKind })}>
                <option value="away">Away</option>
                <option value="busy">Busy</option>
              </select>
              <input aria-label="What" className={inputClass} placeholder="e.g. Christmas at home" value={coming.name ?? ''} onChange={(e) => setComing({ ...coming, name: e.target.value })} />
              <input aria-label="From" type="date" className={inputClass} value={coming.date ?? ''} onChange={(e) => setComing({ ...coming, date: e.target.value })} />
              <input aria-label="To" type="date" className={inputClass} value={coming.endDate ?? ''} onChange={(e) => setComing({ ...coming, endDate: e.target.value })} />
            </div>
            <p className="mt-1 text-xs text-muted">Added to Races & events; the plan bends around it.</p>
          </div>

          <Field label="Note">
            <TextArea value={note} onChange={setNote} placeholder="Anything worth remembering about this week" />
          </Field>
        </div>
      </Card>

      <Card title="Proposed changes">
        {proposals.length ? (
          <ul className="divide-y divide-line">
            {proposals.map((p) => (
              <ProposalRow
                key={p.id}
                p={p}
                checked={!unticked.has(p.id)}
                onToggle={() =>
                  setUnticked((s) => {
                    const n = new Set(s)
                    if (n.has(p.id)) n.delete(p.id)
                    else n.add(p.id)
                    return n
                  })
                }
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing to change: the plan carries on as it is.</p>
        )}
        {!block && proposals.some((p) => p.change) && <p className="mt-3 text-sm text-muted">This week isn’t in a training block, so changes can’t be applied.</p>}
      </Card>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90">
          {accepted.length ? `Save and apply ${accepted.length} change${accepted.length === 1 ? '' : 's'}` : 'Save review'}
        </button>
        {!existing && (
          <button type="button" onClick={skip} className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:bg-surface-2">
            Skip this week
          </button>
        )}
      </div>
    </div>
  )
}
