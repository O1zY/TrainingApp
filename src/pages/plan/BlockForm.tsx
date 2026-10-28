import { Plus, Repeat, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Field, FieldGroup, NumberInput, Toggle, TextInput, inputClass } from '../../components/fields'
import { chip } from '../../components/styles'
import { Card, PageHeader, Segmented } from '../../components/ui'
import { structureSummary } from '../../library/workouts'
import { todayIso } from '../../log/format'
import { useLog } from '../../log/LogStore'
import { SPORTS } from '../../log/sports'
import type { Sport } from '../../log/types'
import { KIND_STYLE, blockWeeks, kindDef, weekLabel } from '../../plan/cycle'
import { addDays, weekStart } from '../../plan/dates'
import { isTest, workoutIntensity } from '../../plan/generate'
import { loggedFor, useReplan } from '../../plan/planned'
import { usePlan, type BlockDraft } from '../../plan/PlanStore'
import type { BlockSport } from '../../plan/types'
import { useSettings } from '../../settings/SettingsContext'

const PLAN_SPORTS: Sport[] = ['erg', 'row', 'run', 'bike', 'swim', 'strength', 'recovery']

const SPORT_DEFAULTS: Record<string, Omit<BlockSport, 'sport'>> = {
  erg: { sessions: 3, key: 1, easyMin: 60, long: true },
  row: { sessions: 2, key: 1, easyMin: 75, long: false },
  run: { sessions: 2, key: 1, easyMin: 40, long: false },
  bike: { sessions: 1, key: 0, easyMin: 60, long: false },
  swim: { sessions: 1, key: 0, easyMin: 40, long: false },
  strength: { sessions: 2, key: 1, easyMin: 45, long: false },
  recovery: { sessions: 1, key: 0, easyMin: 20, long: false },
}

const DAYS = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: String(d), label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d] }))

function blankBlock(weekStartsOn: 0 | 1): BlockDraft {
  return {
    name: '',
    start: addDays(weekStart(todayIso(), weekStartsOn), 7),
    weeks: 12,
    buildWeeks: 3,
    progressionPct: 8,
    deloadPct: 60,
    sports: (['erg', 'run', 'bike', 'strength'] as Sport[]).map((sport) => ({ sport, ...SPORT_DEFAULTS[sport] })),
    maxDays: 6,
    doubles: true,
    restDay: undefined,
    benchmarks: [],
    libraryMix: 40,
  }
}

function SportRow({ value, onChange, onRemove }: { value: BlockSport; onChange: (v: BlockSport) => void; onRemove: () => void }) {
  const def = SPORTS[value.sport]
  const set = (p: Partial<BlockSport>) => onChange({ ...value, ...p })
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className={`mt-5 grid size-9 place-items-center rounded-lg ${def.soft} ${def.text}`}>
        <def.icon className="size-4.5" />
      </span>
      <div>
        <p className="mb-1.5 font-semibold">{def.label}</p>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Per week">
            <NumberInput integer value={value.sessions} onChange={(v) => set({ sessions: Math.min(14, v ?? 0), key: Math.min(value.key, v ?? 0) })} />
          </Field>
          <Field label="Of which hard">
            <NumberInput integer value={value.key} disabled={value.sport === 'recovery'} onChange={(v) => set({ key: Math.min(value.sessions, v ?? 0) })} />
          </Field>
          <Field label="Easy length" unit="min">
            <NumberInput integer value={value.easyMin} onChange={(v) => set({ easyMin: v ?? 30 })} />
          </Field>
        </div>
        {value.sport !== 'recovery' && value.sport !== 'strength' && (
          <div className="mt-2">
            <Toggle checked={value.long} onChange={(long) => set({ long })} label="One easy session is the long one" />
          </div>
        )}
      </div>
      <button type="button" aria-label={`Remove ${def.label}`} onClick={onRemove} className="mt-5 grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text">
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}

function Form({ initial, editing }: { initial: BlockDraft; editing: boolean }) {
  const { saveBlock, deleteBlock, events } = usePlan()
  const { workouts, sessions } = useLog()
  const { settings } = useSettings()
  const replan = useReplan()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(initial)
  const patch = (p: Partial<BlockDraft>) => setDraft((d) => ({ ...d, ...p }))

  const weeks = blockWeeks({ ...draft, start: weekStart(draft.start || todayIso(), settings.weekStartsOn), weeks: Math.max(1, Math.min(52, draft.weeks || 1)) }, events)
  const count = (k: string) => weeks.filter((w) => w.kind === k).length
  const perWeek = draft.sports.filter((s) => s.sport !== 'recovery').reduce((a, s) => a + s.sessions, 0)
  const hard = draft.sports.reduce((a, s) => a + s.key, 0)
  const candidates = workouts.filter((w) => draft.sports.some((s) => s.sport === w.sport)).sort((a, b) => a.sport.localeCompare(b.sport) || a.name.localeCompare(b.name))
  const missing = PLAN_SPORTS.filter((s) => !draft.sports.some((x) => x.sport === s))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const saved = saveBlock({ ...draft, name: draft.name.trim() || 'Training block', start: weekStart(draft.start, settings.weekStartsOn) })
    replan({ blocks: [saved] })
    navigate(`/plan?block=${saved.id}`, { replace: editing })
  }

  const remove = () => {
    if (!draft.id || !confirm('Delete this block and the sessions it planned? Sessions you logged are kept.')) return
    deleteBlock(draft.id, (p) => !!loggedFor(p, sessions))
    navigate('/plan', { replace: true })
  }

  return (
    <form onSubmit={submit} className="space-y-5 pb-24">
      <Card title="Block">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <TextInput value={draft.name || undefined} onChange={(v) => patch({ name: v ?? '' })} placeholder="e.g. Winter base" />
          </Field>
          <Field label="Goal">
            <TextInput value={draft.goal} onChange={(goal) => patch({ goal })} placeholder="e.g. Sub-6:20 2k, head season" />
          </Field>
          <Field label="Starts" hint="Moved to the start of that week.">
            <input type="date" required className={inputClass} value={draft.start} onChange={(e) => patch({ start: e.target.value })} />
          </Field>
          <Field label="Length" unit="weeks">
            <NumberInput integer value={draft.weeks} onChange={(v) => patch({ weeks: Math.max(1, Math.min(52, v ?? 1)) })} />
          </Field>
        </div>
      </Card>

      <Card title="Cycle">
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Build weeks before each deload</p>
              <p className="text-sm text-muted">3:1 is the standard. Races, holidays and taper weeks move it about.</p>
            </div>
            <Segmented<'2' | '3' | '4'>
              value={String(draft.buildWeeks) as '2' | '3' | '4'}
              onChange={(v) => patch({ buildWeeks: Number(v) })}
              options={[
                { value: '2', label: '2:1' },
                { value: '3', label: '3:1' },
                { value: '4', label: '4:1' },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Volume added each build week" unit="%">
              <NumberInput integer value={draft.progressionPct} onChange={(v) => patch({ progressionPct: Math.min(25, v ?? 0) })} />
            </Field>
            <Field label="Deload volume" unit="% of build 1">
              <NumberInput integer value={draft.deloadPct} onChange={(v) => patch({ deloadPct: Math.min(100, v ?? 60) })} />
            </Field>
          </div>
          <div>
            <div className="flex items-end gap-1">
              {weeks.map((w) => (
                <div key={w.start} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${weekLabel(w)}${w.notes.length ? `: ${w.notes.join(', ')}` : ''}`}>
                  <span className="flex h-12 w-full items-end justify-center">
                    <span className={`w-full max-w-6 rounded ${KIND_STYLE[w.kind].bg}`} style={{ height: `${Math.max(14, (w.volume / 1.4) * 100)}%` }} />
                  </span>
                  <span className="text-[10px] font-semibold text-muted">{w.kind === 'build' ? `B${w.buildNo}` : kindDef(w.kind).short}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              {[`${count('build')} build`, `${count('deload')} deload`, count('taper') && `${count('taper')} taper`, count('race') && `${count('race')} race`, count('recovery') && `${count('recovery')} recovery`]
                .filter(Boolean)
                .join(' · ')}
              {' · '}races and away events from Plan › Races & events are included
            </p>
          </div>
        </div>
      </Card>

      <Card title={`Sports · ${perWeek} sessions, ${hard} hard per build week`}>
        <div className="divide-y divide-line">
          {draft.sports.map((s, i) => (
            <SportRow
              key={s.sport}
              value={s}
              onChange={(v) => patch({ sports: draft.sports.map((x, j) => (j === i ? v : x)) })}
              onRemove={() => patch({ sports: draft.sports.filter((_, j) => j !== i) })}
            />
          ))}
        </div>
        {missing.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {missing.map((sport) => (
              <button key={sport} type="button" className={`${chip(false)} inline-flex items-center gap-1`} onClick={() => patch({ sports: [...draft.sports, { sport, ...SPORT_DEFAULTS[sport] }] })}>
                <Plus className="size-3.5" /> {SPORTS[sport].label}
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card title="Week shape">
        <div className="space-y-4">
          <FieldGroup label="Most training days a week" hint="Recovery work doesn't count as a training day.">
            <div className="flex flex-wrap gap-1.5">
              {[3, 4, 5, 6, 7].map((n) => (
                <button key={n} type="button" className={chip(draft.maxDays === n)} onClick={() => patch({ maxDays: n })}>
                  {n}
                </button>
              ))}
            </div>
          </FieldGroup>
          <FieldGroup label="Rest day" hint="Kept free unless the week has nowhere else to go.">
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={chip(draft.restDay == null)} onClick={() => patch({ restDay: undefined })}>
                Any
              </button>
              {DAYS.map((d) => (
                <button key={d.value} type="button" className={chip(draft.restDay === Number(d.value))} onClick={() => patch({ restDay: Number(d.value) })}>
                  {d.label}
                </button>
              ))}
            </div>
          </FieldGroup>
          <Toggle checked={draft.doubles} onChange={(doubles) => patch({ doubles })} label="Allow two sessions in a day (e.g. lifting on a hard erg day)" />
        </div>
      </Card>

      <Card title="Library and one-offs">
        <div className="space-y-4">
          <Field label={`${draft.libraryMix}% from your library · ${100 - draft.libraryMix}% one-off sessions`} hint="One-offs come from a built-in set that rotates week to week and grows with the block. Benchmarks below are on top of this.">
            <input type="range" min={0} max={100} step={10} value={draft.libraryMix} onChange={(e) => patch({ libraryMix: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
          </Field>
          <div>
            <p className="font-medium">Benchmarks</p>
            <p className="text-sm text-muted">
              Repeated at the same point of every cycle so you can compare attempts. Tests (type “Test” or tagged #test) close each deload instead.
            </p>
            {candidates.length ? (
              <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                {candidates.map((w) => {
                  const on = draft.benchmarks.includes(w.id)
                  const def = SPORTS[w.sport]
                  return (
                    <li key={w.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--accent)]"
                          checked={on}
                          onChange={() => patch({ benchmarks: on ? draft.benchmarks.filter((b) => b !== w.id) : [...draft.benchmarks, w.id] })}
                        />
                        <def.icon className={`size-4 shrink-0 ${def.text}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{w.name}</span>
                          <span className="block truncate text-xs text-muted">{structureSummary(w, settings.units)}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted">{isTest(w) ? 'Test' : workoutIntensity(w) === 'key' ? 'Hard' : workoutIntensity(w) === 'easy' ? 'Easy' : 'Steady-hard'}</span>
                        {on && <Repeat className="size-4 shrink-0 text-accent-strong" />}
                      </label>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No library workouts for these sports yet. Add some in Library and they’ll show here.</p>
            )}
          </div>
        </div>
      </Card>

      {editing && (
        <button type="button" onClick={remove} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-text">
          <Trash2 className="size-4" /> Delete block
        </button>
      )}

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-2 md:px-4">
          <button type="button" onClick={() => navigate(-1)} className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">
            Cancel
          </button>
          <button type="submit" disabled={!draft.sports.length} className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90 disabled:opacity-50">
            {editing ? 'Save and re-plan' : 'Build the plan'}
          </button>
        </div>
      </div>
    </form>
  )
}

export function NewBlock() {
  const { settings } = useSettings()
  return (
    <>
      <PageHeader title="New block" subtitle="Set the shape; the planner fills in the sessions around your work and races." />
      <Form initial={blankBlock(settings.weekStartsOn)} editing={false} />
    </>
  )
}

export function EditBlock() {
  const { id } = useParams()
  const { blocks } = usePlan()
  const block = blocks.find((b) => b.id === id)
  if (!block) return <Navigate to="/plan" replace />
  return (
    <>
      <PageHeader title="Edit block" subtitle="Saving re-plans from today. Logged and hand-edited sessions are kept." />
      <Form initial={block} editing />
    </>
  )
}
