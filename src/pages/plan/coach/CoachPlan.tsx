import { ArrowLeft, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Toggle } from '../../../components/fields'
import { Card, PageHeader } from '../../../components/ui'
import { trainingHistory, workPattern } from '../../../coach/history'
import { coachPlan, type Proposal } from '../../../coach/rules'
import { formatDate, todayIso } from '../../../log/format'
import { useLog } from '../../../log/LogStore'
import { SPORTS } from '../../../log/sports'
import type { Workout } from '../../../log/types'
import { KIND_STYLE, blockWeeks, kindDef } from '../../../plan/cycle'
import { addDays } from '../../../plan/dates'
import { blockEnd, loggedFor, useReplan } from '../../../plan/planned'
import { usePlan } from '../../../plan/PlanStore'
import { useSettings } from '../../../settings/SettingsContext'
import { NoteRow, Warning } from './parts'

// Plan › Coach › Build plan: the rule-based coach's proposal (src/coach/rules.ts) to read
// through, then create as a block. Every choice shows the research behind it, or says it's
// the coach's judgement. Nothing is saved until "Create this block".

function Summary({ p }: { p: Proposal }) {
  const { events } = usePlan()
  const weeks = blockWeeks(p.block, events)
  const max = Math.max(...weeks.map((w) => w.volume))
  return (
    <Card title={p.block.name}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {formatDate(p.block.start)} – {formatDate(blockEnd(p.block))} · {p.block.weeks} weeks · {p.startHours}h a week at first, about {p.peakHours}h at the peak
        </p>
        <div>
          <div className="flex items-end gap-1" aria-label="Weeks of the block, by volume">
            {weeks.map((w) => (
              <span key={w.start} className="flex h-14 min-w-0 flex-1 items-end" title={`${kindDef(w.kind).label} · ${formatDate(w.start, { day: 'numeric', month: 'short' })}`}>
                <span className={`w-full rounded-sm ${KIND_STYLE[w.kind].bg}`} style={{ height: `${Math.max(12, (w.volume / max) * 100)}%` }} />
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {(['build', 'deload', 'taper', 'race', 'recovery'] as const)
              .map((k) => [k, weeks.filter((w) => w.kind === k).length] as const)
              .filter(([, n]) => n)
              .map(([k, n]) => `${n} ${kindDef(k).label.toLowerCase()}`)
              .join(' · ')}
          </p>
        </div>
        <ul className="divide-y divide-line">
          {p.block.sports.map((s) => {
            const def = SPORTS[s.sport]
            return (
              <li key={s.sport} className="flex items-center gap-3 py-2 text-sm">
                <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${def.soft} ${def.text}`}>
                  <def.icon className="size-4" />
                </span>
                <span className="flex-1 font-medium">{def.label}</span>
                <span className="tabular text-right text-muted">
                  {s.sessions} a week{s.key ? ` · ${s.key} hard` : ''} · easy {s.easyMin}′{s.long ? ` · 1 long (${Math.round((s.easyMin * 1.5) / 5) * 5}′)` : ''}
                </span>
              </li>
            )
          })}
        </ul>
        <p className="text-xs text-muted">Lengths are for the first week and grow with the block. The planner then places every session around your shifts and events.</p>
      </div>
    </Card>
  )
}

const stamp = () => new Date().toISOString()

export default function CoachPlan() {
  const plan = usePlan()
  const { profile, events, commitments, prefs, blocks, planned, saveBlock, deleteBlock } = plan
  const { sessions, wellbeing, workouts, saveWorkout } = useLog()
  const { settings } = useSettings()
  const replan = useReplan()
  const navigate = useNavigate()
  const today = todayIso()
  const [replace, setReplace] = useState(true)

  const result = useMemo(
    () =>
      coachPlan({
        profile,
        events,
        history: trainingHistory(sessions, wellbeing, today, settings.weekStartsOn),
        work: workPattern(commitments, prefs, today, settings.weekStartsOn),
        today,
        weekStartsOn: settings.weekStartsOn,
        hrv: wellbeing.some((w) => w.date >= addDays(today, -27) && w.hrv != null),
      }),
    [profile, events, sessions, wellbeing, commitments, prefs, today, settings.weekStartsOn],
  )

  const back = (
    <Link to="/plan/coach" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
      <ArrowLeft className="size-4" /> Coach screening
    </Link>
  )

  if (!result.ok)
    return (
      <div className="space-y-5">
        {back}
        <PageHeader title="Build my plan" />
        <Card className="max-w-3xl">
          <p className="text-sm">The coach needs the screening finished first. Still to do:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {result.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <Link to="/plan/coach" className="mt-4 inline-block rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent">
            Finish the screening
          </Link>
        </Card>
      </div>
    )

  const p = result.proposal
  const end = blockEnd(p.block)
  const overlapping = blocks.filter((b) => b.start <= end && blockEnd(b) >= p.block.start && blockEnd(b) >= today)

  const create = () => {
    // Reuse bricks from an earlier run rather than adding copies to the library.
    const bricks: Workout[] = p.bricks.map((b) => workouts.find((w) => w.name === b.name && w.tags.includes('coach')) ?? saveWorkout(b))
    if (replace) for (const b of overlapping) deleteBlock(b.id, (x) => x.date < today || !!loggedFor(x, sessions))
    const block = saveBlock({
      ...p.block,
      benchmarks: bricks.map((b) => b.id),
      coach: { at: stamp(), notes: p.decisions, warnings: p.warnings },
    })
    replan({ blocks: [block], workouts: [...workouts.filter((w) => !bricks.some((b) => b.id === w.id)), ...bricks] })
    navigate(`/plan?block=${block.id}`)
  }

  const unlogged = (id: string) => planned.filter((x) => x.blockId === id && x.date >= today && !loggedFor(x, sessions)).length

  return (
    <div className="space-y-5">
      {back}
      <PageHeader title="Build my plan" subtitle="Built by rules from your screening and the research library. Every choice says why; nothing changes until you create the block." />
      <div className="max-w-3xl space-y-5">
        {p.warnings.length > 0 && (
          <div className="space-y-2">
            {p.warnings.map((w) => (
              <Warning key={w} text={w} />
            ))}
          </div>
        )}
        <Summary p={p} />
        {p.bricks.length > 0 && (
          <Card title="Bricks added to your library">
            <ol className="space-y-3 text-sm">
              {p.bricks.map((b, i) => (
                <li key={b.name}>
                  <div className="font-medium">
                    Build week {i + 1}: {b.name}
                  </div>
                  <p className="text-muted">{b.description}</p>
                </li>
              ))}
            </ol>
          </Card>
        )}
        <Card title="Why">
          <ul className="divide-y divide-line">
            {p.decisions.map((d) => (
              <NoteRow key={d.area + d.text} note={d} />
            ))}
          </ul>
        </Card>
        <Card>
          <div className="space-y-3">
            {overlapping.length > 0 && (
              <div className="space-y-1">
                <Toggle checked={replace} onChange={setReplace} label={`Replace ${overlapping.map((b) => b.name || 'your current block').join(', ')}`} />
                <p className="text-xs text-muted">
                  {!replace
                    ? 'Both blocks would plan sessions over the same weeks.'
                    : ((n) => (n ? `Its ${n} upcoming session${n === 1 ? '' : 's'} go; anything already logged stays in your log.` : 'It has no upcoming sessions; anything already logged stays in your log.'))(
                        overlapping.reduce((a, b) => a + unlogged(b.id), 0),
                      )}
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">You can change anything afterwards in the block’s settings.</p>
              <button type="button" onClick={create} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90">
                <Sparkles className="size-4" /> Create this block
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
