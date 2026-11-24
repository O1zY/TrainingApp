import { ClipboardCheck, MoonStar } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate, todayIso } from '../../log/format'
import { useLog } from '../../log/LogStore'
import { addDays } from '../../plan/dates'
import { blockEnd } from '../../plan/planned'
import { usePlan } from '../../plan/PlanStore'
import { reviewDue } from '../../review/due'
import { morningCheck, swapPlan } from '../../review/morning'
import { useSettings } from '../../settings/SettingsContext'

const range = (ws: string) => `${formatDate(ws, { day: 'numeric', month: 'short' })} – ${formatDate(addDays(ws, 6), { day: 'numeric', month: 'short' })}`

/** "Review your week" while a finished week is waiting for one. */
export function ReviewDueCard() {
  const { planned, reviews } = usePlan()
  const { settings } = useSettings()
  const [now] = useState(() => new Date())
  const week = reviewDue(now, todayIso(), settings.weekStartsOn, planned, reviews)
  if (!week) return null
  return (
    <Link to={`/plan/review/${week}`} className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 hover:brightness-105">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-on-accent">
        <ClipboardCheck className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Review your week</span>
        <span className="block text-sm text-muted">{range(week)}: how it went, and what to change in the weeks ahead. About two minutes.</span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-accent-strong">Start</span>
    </Link>
  )
}

/** Under a past week on Plan: its review, or a link to do one. */
export function WeekReviewLine({ start }: { start: string }) {
  const { reviews } = usePlan()
  const r = reviews.find((x) => x.weekStart === start)
  if (addDays(start, 6) >= todayIso() && !r) return null
  if (!r)
    return (
      <Link to={`/plan/review/${start}`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong">
        <ClipboardCheck className="size-4" /> Review this week
      </Link>
    )
  const taken = r.proposals.filter((p) => r.accepted.includes(p.id))
  return (
    <Link to={`/plan/review/${start}`} className="mb-3 flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm hover:brightness-95">
      <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-muted" />
      <span>
        {r.status === 'skipped' ? (
          'Review skipped'
        ) : (
          <>
            Reviewed{r.felt ? `, felt ${r.felt}/5` : ''}
            {r.snapshot ? ` · ${r.snapshot.done}/${r.snapshot.planned} sessions` : ''}
            {taken.length ? ` · ${taken.map((p) => p.title).join('; ')}` : ' · no changes'}
            {r.note && <span className="block text-muted">“{r.note}”</span>}
          </>
        )}
      </span>
    </Link>
  )
}

/** After the morning check-in: swap today's hard session for an easy one, or keep it. */
export function MorningCheckCard() {
  const { sessions, wellbeing } = useLog()
  const { planned, events, blocks, dayChecks, savePlanned, saveDayCheck } = usePlan()
  const { settings } = useSettings()
  const today = todayIso()
  const check = morningCheck({ today, planned, sessions, wellbeing, dayChecks })
  if (!check) return null
  const block = blocks.find((b) => b.id === check.session.blockId) ?? blocks.find((b) => b.start <= today && blockEnd(b) >= today)
  const swap = swapPlan({ today, session: check.session, planned, events, block, weekStartsOn: settings.weekStartsOn })

  const doSwap = () => {
    savePlanned(swap.easy)
    if (swap.moved) savePlanned(swap.moved)
    saveDayCheck({ date: today, choice: 'swapped', reasons: check.reasons })
  }

  return (
    <div className="rounded-2xl border border-over/40 bg-over/10 p-4">
      <div className="flex items-start gap-3">
        <MoonStar className="mt-0.5 size-5 shrink-0 text-over" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Swap today’s {check.session.title} for something easy?</p>
          <p className="mt-0.5 text-sm text-muted">
            {check.reasons.join(', ')}. Hard sessions go better on a good night’s sleep{check.findings.includes('hrv-guided') ? ' and normal HRV' : ''}.{' '}
            {swap.moved
              ? `Today becomes ${swap.easy.title.toLowerCase()}, and ${check.session.title} moves to ${formatDate(swap.moved.date, { weekday: 'long' })}.`
              : `Today becomes ${swap.easy.title.toLowerCase()}; there’s no free day for ${check.session.title} later this week, so it’s dropped.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={doSwap} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:opacity-90">
              Swap it
            </button>
            <button
              type="button"
              onClick={() => saveDayCheck({ date: today, choice: 'kept', reasons: check.reasons })}
              className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-2"
            >
              Keep it
            </button>
            {check.findings.map((id) => (
              <Link key={id} to={`/plan/coach/research#${id}`} className="self-center text-xs font-medium text-accent-strong hover:underline">
                Why?
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
