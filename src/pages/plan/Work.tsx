import { ArrowLeft, CalendarSync, FileUp, Plus, Trash2 } from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Chips, Field, FieldGroup, NumberInput, TextInput, inputClass } from '../../components/fields'
import { Card, PageHeader, Segmented } from '../../components/ui'
import { formatDate, todayIso } from '../../log/format'
import { googleConfigured, googleConnected, googleEvents, listCalendars, parseIcs, toCommitments, type CommitmentDraft } from '../../plan/calendar'
import { addDays, weekDates, weekStart } from '../../plan/dates'
import { DEMANDS, DEMAND_OPTIONS, dayLoad, weekWork } from '../../plan/load'
import { blockEnd, useReplan } from '../../plan/planned'
import { mergeImported } from '../../plan/data'
import { usePlan } from '../../plan/PlanStore'
import type { Commitment, Demand } from '../../plan/types'
import { useSettings } from '../../settings/SettingsContext'
import { StrainDot, WorkdayFields } from './bits'

const draftId = (c: CommitmentDraft, i: number): Commitment => ({ ...c, id: `new-${i}` })

/** How far ahead imports read: eight weeks, or to the end of the last block. */
function useImportRange() {
  const { blocks } = usePlan()
  const from = todayIso()
  const lastBlock = blocks.map(blockEnd).sort().at(-1)
  const eight = addDays(from, 56)
  const to = lastBlock && lastBlock > eight ? (lastBlock < addDays(from, 182) ? lastBlock : addDays(from, 182)) : eight
  return { from, to }
}

function AddShift() {
  const { commitments, addCommitments } = usePlan()
  const replan = useReplan()
  const [kind, setKind] = useState<Commitment['kind']>('work')
  const [date, setDate] = useState(todayIso())
  const [start, setStart] = useState('07:00')
  const [end, setEnd] = useState('15:00')
  const [demand, setDemand] = useState<Demand>('physical')
  const [title, setTitle] = useState<string>()
  const [repeat, setRepeat] = useState<number | undefined>(0)
  const [done, setDone] = useState<string>()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const list: CommitmentDraft[] = Array.from({ length: (repeat ?? 0) + 1 }, (_, i) => ({
      date: addDays(date, i * 7),
      start,
      end,
      kind,
      demand: kind === 'work' ? demand : undefined,
      title: title?.trim() || undefined,
      source: 'manual',
    }))
    addCommitments(list)
    replan({ commitments: [...commitments, ...list.map(draftId)] })
    setDone(`Added ${list.length} ${kind === 'work' ? 'shift' : 'commitment'}${list.length === 1 ? '' : 's'} and re-fitted the plan.`)
    setDate(addDays(date, 1))
  }

  return (
    <Card title="Add a shift">
      <form onSubmit={submit} className="space-y-4">
        <Segmented<Commitment['kind']>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'work', label: 'Work shift' },
            { value: 'busy', label: 'Other commitment' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Date" className="col-span-2 sm:col-span-1">
            <input type="date" required className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Start">
            <input type="time" required className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="End" hint={end <= start ? 'Finishes the next morning' : undefined}>
            <input type="time" required className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="Repeat weekly" unit="more weeks" className="col-span-2 sm:col-span-1">
            <NumberInput integer value={repeat} onChange={(v) => setRepeat(Math.min(26, v ?? 0))} placeholder="0" />
          </Field>
        </div>
        <Field label="Label">
          <TextInput value={title} onChange={setTitle} placeholder={kind === 'work' ? 'e.g. Waitrose, delivery driver' : 'e.g. Lecture, family dinner'} />
        </Field>
        {kind === 'work' && (
          <FieldGroup label="How physical is it?" hint={DEMANDS[demand].hint}>
            <Chips<Demand> value={demand} options={DEMAND_OPTIONS} onChange={(v) => v && setDemand(v)} allowNone={false} />
          </FieldGroup>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90">
            <Plus className="size-4" /> Add {repeat ? `${(repeat ?? 0) + 1} ${kind === 'work' ? 'shifts' : 'commitments'}` : kind === 'work' ? 'shift' : 'commitment'}
          </button>
          {done && <p className="text-sm text-muted">{done}</p>}
        </div>
      </form>
    </Card>
  )
}

function GoogleCalendar() {
  const { prefs, commitments, updatePrefs, replaceImported } = usePlan()
  const replan = useReplan()
  const range = useImportRange()
  const [calendars, setCalendars] = useState<{ id: string; name: string; primary: boolean }[]>()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>()

  if (!googleConfigured) {
    return (
      <Card title="Google Calendar">
        <p className="text-sm text-muted">
          Live sync needs a Google OAuth client ID for this site. Create a “Web application” client in Google Cloud with the Calendar API enabled, allow this site’s address as a
          JavaScript origin, and put the ID in <code className="rounded bg-surface-2 px-1">VITE_GOOGLE_CLIENT_ID</code> (see <code className="rounded bg-surface-2 px-1">.env.example</code>).
        </p>
        <p className="mt-2 text-sm text-muted">Until then, export your calendar as an .ics file and import it below. Google Calendar: Settings › Import & export › Export.</p>
      </Card>
    )
  }

  const connect = async () => {
    setBusy(true)
    setStatus(undefined)
    try {
      setCalendars(await listCalendars())
    } catch (e) {
      setStatus((e as Error).message)
    }
    setBusy(false)
  }

  const sync = async () => {
    setBusy(true)
    setStatus('Reading your calendar…')
    try {
      const events = await googleEvents(prefs.calendarIds, range.from, range.to)
      const list = toCommitments(events, prefs, 'google')
      replaceImported('google', range.from, range.to, list)
      updatePrefs({ lastSync: new Date().toISOString() })
      replan({ commitments: mergeImported(commitments, 'google', range.from, range.to, list) })
      const work = list.filter((c) => c.kind === 'work').length
      setStatus(`Synced to ${formatDate(range.to)}: ${work} work shift${work === 1 ? '' : 's'}, ${list.length - work} other. Plan re-fitted.`)
    } catch (e) {
      setStatus((e as Error).message)
    }
    setBusy(false)
  }

  const toggle = (id: string) =>
    updatePrefs({ calendarIds: prefs.calendarIds.includes(id) ? prefs.calendarIds.filter((c) => c !== id) : [...prefs.calendarIds, id] })

  return (
    <Card title="Google Calendar">
      <p className="text-sm text-muted">
        Reads (never changes) your calendar up to {formatDate(range.to)}. Events with a work keyword in the title become shifts; the rest is time you’re busy.
        {prefs.lastSync && ` Last synced ${formatDate(prefs.lastSync.slice(0, 10))}.`}
      </p>
      {calendars && (
        <ul className="mt-3 space-y-1.5">
          {calendars.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={prefs.calendarIds.includes(c.id)} onChange={() => toggle(c.id)} />
                {c.name}
                {c.primary && <span className="text-xs text-muted">(main)</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!calendars && (
          <button type="button" disabled={busy} onClick={connect} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50">
            {googleConnected() ? 'Choose calendars' : 'Connect Google'}
          </button>
        )}
        <button
          type="button"
          disabled={busy || !prefs.calendarIds.length}
          onClick={sync}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-on-accent hover:opacity-90 disabled:opacity-50"
        >
          <CalendarSync className="size-4" /> Sync now
        </button>
      </div>
      {status && <p className="mt-3 text-sm">{status}</p>}
    </Card>
  )
}

function IcsImport() {
  const { prefs, commitments, replaceImported } = usePlan()
  const replan = useReplan()
  const range = useImportRange()
  const [status, setStatus] = useState<string>()

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const events = parseIcs(await file.text(), range.from, range.to)
    if (!events.length) return setStatus(`No timed events between now and ${formatDate(range.to)} in that file.`)
    const list = toCommitments(events, prefs, 'ics')
    replaceImported('ics', range.from, range.to, list)
    replan({ commitments: mergeImported(commitments, 'ics', range.from, range.to, list) })
    const work = list.filter((c) => c.kind === 'work').length
    setStatus(`Imported ${work} work shift${work === 1 ? '' : 's'} and ${list.length - work} other event${list.length - work === 1 ? '' : 's'} to ${formatDate(range.to)}. Plan re-fitted.`)
  }

  return (
    <Card title="Import a calendar file">
      <p className="text-sm text-muted">An .ics file from Google, Outlook, Apple Calendar or a rota app. Importing again replaces what the last file added.</p>
      <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2">
        <FileUp className="size-4" /> Choose .ics file
        <input type="file" accept=".ics,text/calendar" className="sr-only" onChange={onFile} />
      </label>
      {status && <p className="mt-3 text-sm">{status}</p>}
    </Card>
  )
}

function WorkingDay() {
  const { prefs, updatePrefs } = usePlan()
  const replan = useReplan()
  const [value, setValue] = useState({ commuteMin: prefs.commuteMin, gapMin: prefs.gapMin })
  const [saved, setSaved] = useState(false)
  const changed = value.commuteMin !== prefs.commuteMin || value.gapMin !== prefs.gapMin || !prefs.workdaySet
  const save = () => {
    const next = { ...prefs, ...value, workdaySet: true }
    updatePrefs(next)
    replan({ prefs: next })
    setSaved(true)
  }
  return (
    <Card title="Your working day">
      <WorkdayFields value={value} onChange={(v) => { setValue(v); setSaved(false) }} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={!changed} onClick={save} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:opacity-90 disabled:opacity-50">
          Save and re-plan
        </button>
        {saved && <p className="text-sm text-muted">Saved. Sessions around your shifts have been re-fitted.</p>}
        {!prefs.workdaySet && !saved && <p className="text-sm text-muted">Using {prefs.commuteMin}′ travel and a {prefs.gapMin}′ gap until you set your own.</p>}
      </div>
    </Card>
  )
}

function ImportSettings() {
  const { prefs, updatePrefs } = usePlan()
  const [keywords, setKeywords] = useState(prefs.workKeywords.join(', '))
  return (
    <Card title="How your time is read">
      <div className="space-y-4">
        <Field label="Work keywords" hint="Imported events with one of these in the title count as work. Comma-separated.">
          <input
            className={inputClass}
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            onBlur={() => updatePrefs({ workKeywords: keywords.split(',').map((k) => k.trim()).filter(Boolean) })}
            placeholder="shift, work, Waitrose"
          />
        </Field>
        <FieldGroup label="Imported shifts are" hint={DEMANDS[prefs.defaultDemand].hint}>
          <Chips<Demand> value={prefs.defaultDemand} options={DEMAND_OPTIONS} onChange={(v) => v && updatePrefs({ defaultDemand: v })} allowNone={false} />
        </FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Train from">
            <input type="time" className={inputClass} value={prefs.dayStart} onChange={(e) => e.target.value && updatePrefs({ dayStart: e.target.value })} />
          </Field>
          <Field label="Train until">
            <input type="time" className={inputClass} value={prefs.dayEnd} onChange={(e) => e.target.value && updatePrefs({ dayEnd: e.target.value })} />
          </Field>
        </div>
        <p className="text-xs text-muted">Changes here apply the next time the plan re-fits (adding a shift, syncing, or Re-plan on the Plan page).</p>
      </div>
    </Card>
  )
}

function Upcoming() {
  const { commitments, prefs, updateCommitment, deleteCommitment } = usePlan()
  const { settings } = useSettings()
  const replan = useReplan()
  const today = todayIso()
  const ahead = commitments.filter((c) => c.date >= addDays(today, -1))
  const weeks = [...new Set(ahead.map((c) => weekStart(c.date, settings.weekStartsOn)))].sort().slice(0, 8)

  const change = (id: string, patch: Partial<Commitment>) => {
    updateCommitment(id, patch)
    replan({ commitments: commitments.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  }
  const remove = (id: string) => {
    deleteCommitment(id)
    replan({ commitments: commitments.filter((c) => c.id !== id) })
  }

  if (!weeks.length) return <Card title="Coming up"><p className="text-sm text-muted">Nothing yet. Shifts you add or import show here, week by week.</p></Card>

  return (
    <Card title="Coming up">
      <div className="space-y-5">
        {weeks.map((ws) => {
          const loads = weekDates(ws).map((d) => dayLoad(d, commitments, prefs))
          const total = weekWork(loads)
          return (
            <div key={ws}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">Week of {formatDate(ws, { day: 'numeric', month: 'short' })}</h3>
                <span className="tabular text-xs text-muted">{Math.round(total.hours * 10) / 10}h work · load {total.load}</span>
              </div>
              <ul className="divide-y divide-line">
                {ahead
                  .filter((c) => c.date >= ws && c.date < addDays(ws, 7))
                  .map((c) => {
                    const load = loads.find((l) => l.date === c.date)!
                    return (
                      <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                        <StrainDot strain={load.strain} />
                        <span className="w-24 text-sm font-medium">{formatDate(c.date)}</span>
                        <span className="tabular w-24 text-sm">
                          {c.start}–{c.end}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-muted">
                          {c.title ?? (c.kind === 'work' ? 'Work' : 'Busy')}
                          {c.source !== 'manual' && <span className="ml-1.5 text-xs">({c.source === 'google' ? 'Google' : '.ics'})</span>}
                        </span>
                        <select
                          aria-label="Type"
                          className="rounded-lg border border-line bg-surface px-2 py-1 text-sm"
                          value={c.kind === 'work' ? (c.demand ?? 'feet') : 'busy'}
                          onChange={(e) => change(c.id, e.target.value === 'busy' ? { kind: 'busy', demand: undefined } : { kind: 'work', demand: e.target.value as Demand })}
                        >
                          {DEMAND_OPTIONS.map((d) => (
                            <option key={d.value} value={d.value}>
                              Work · {d.label}
                            </option>
                          ))}
                          <option value="busy">Busy, not work</option>
                        </select>
                        <button type="button" aria-label="Delete" onClick={() => remove(c.id)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text">
                          <Trash2 className="size-4" />
                        </button>
                      </li>
                    )
                  })}
              </ul>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

export default function Work() {
  return (
    <div className="space-y-5">
      <Link to="/plan" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Plan
      </Link>
      <PageHeader
        title="Work & calendar"
        subtitle="Shifts and commitments the plan fits around. Hard sessions go on your lighter days, and easy ones get shortened or moved when a shift leaves no room."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <WorkingDay />
          <AddShift />
          <GoogleCalendar />
          <IcsImport />
          <ImportSettings />
        </div>
        <Upcoming />
      </div>
    </div>
  )
}
