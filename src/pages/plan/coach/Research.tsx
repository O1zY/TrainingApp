import { ArrowLeft, BookOpen, ExternalLink } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Segmented } from '../../../components/ui'
import { FINDINGS, STRENGTH_LABEL, coachContext, doiUrl, pubmedUrl, relevantFindings, shortCite, sourcesFor, type Finding, type Strength } from '../../../coach/evidence'
import { addDays } from '../../../plan/dates'
import { todayIso } from '../../../log/format'
import { useLog } from '../../../log/LogStore'
import { usePlan } from '../../../plan/PlanStore'

// Plan › Coach › Research (section 11b): the findings the coach builds plans from, each
// with its guidance, caveats and the studies behind it, so every suggestion can be checked.

const STRENGTH_STYLE: Record<Strength, string> = {
  strong: 'bg-accent text-on-accent',
  moderate: 'bg-accent-soft text-accent-strong',
  limited: 'border border-line text-muted',
}

function FindingCard({ finding, reasons }: { finding: Finding; reasons?: string[] }) {
  const sources = sourcesFor(finding)
  return (
    <article className="rounded-[20px] border border-line/70 bg-surface p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">{finding.title}</h2>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STRENGTH_STYLE[finding.strength]}`}>{STRENGTH_LABEL[finding.strength]}</span>
      </div>
      <p className="mt-2 text-sm">{finding.summary}</p>
      {reasons && reasons.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {reasons.map((r) => (
            <span key={r} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">
              {r}
            </span>
          ))}
        </div>
      )}
      <details className="group mt-3">
        <summary className="cursor-pointer text-sm font-medium text-accent-strong">What the coach does with it · {sources.length} {sources.length === 1 ? 'study' : 'studies'}</summary>
        <div className="mt-3 space-y-4 text-sm">
          <ul className="list-disc space-y-1 pl-5">
            {finding.guidance.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
          <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-muted">
            <span className="font-medium text-text">Caveats: </span>
            {finding.caveats}
          </p>
          <p className="text-xs text-muted">Shapes: {finding.shapes.join(', ')}</p>
          <ol className="space-y-3">
            {sources.map((s) => (
              <li key={s.id} className="border-l-2 border-line pl-3">
                <div className="font-medium">
                  {shortCite(s)} · <span className="text-muted">{s.design}</span>
                </div>
                <div className="text-xs text-muted">
                  {s.authors}. {s.title}. <i>{s.journal}</i> {s.year}
                  {s.ref ? `;${s.ref}` : ''}.
                </div>
                <div className="mt-1 text-xs text-muted">Studied: {s.population}</div>
                <p className="mt-1">{s.finding}</p>
                <div className="mt-1 flex flex-wrap gap-3 text-xs font-medium">
                  <a href={doiUrl(s)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-strong">
                    doi:{s.doi} <ExternalLink className="size-3" />
                  </a>
                  {pubmedUrl(s) && (
                    <a href={pubmedUrl(s)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-strong">
                      PubMed <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </details>
    </article>
  )
}

export default function Research() {
  const { profile, events, commitments } = usePlan()
  const { wellbeing } = useLog()
  const [view, setView] = useState<'mine' | 'all'>('mine')
  const today = todayIso()

  const relevant = useMemo(() => {
    const from = addDays(today, -27)
    const ctx = coachContext(profile, events, {
      hrv: wellbeing.some((w) => w.date >= from && w.hrv != null),
      shifts: commitments.some((c) => c.kind === 'work'),
    })
    return relevantFindings(ctx)
  }, [profile, events, wellbeing, commitments, today])
  const reasons = new Map(relevant.map((r) => [r.finding.id, r.reasons]))
  const shown = view === 'mine' ? relevant.map((r) => r.finding) : FINDINGS

  return (
    <div className="space-y-5">
      <Link to="/plan/coach" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Coach screening
      </Link>
      <PageHeader title="Research" subtitle="What the coach builds plans from: each finding with its guidance, caveats and the studies behind it." />
      <div className="flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'mine', label: `For you (${relevant.length})` },
            { value: 'all', label: `All (${FINDINGS.length})` },
          ]}
        />
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <BookOpen className="size-3.5" /> Duathlon and triathlon first; more sports to follow
        </span>
      </div>
      {view === 'mine' && !profile && <p className="max-w-3xl text-sm text-muted">Showing general findings. Finish the screening and this narrows to your race, injuries and week.</p>}
      <div className="max-w-3xl space-y-3">
        {shown.map((f) => (
          <FindingCard key={f.id} finding={f} reasons={view === 'mine' ? reasons.get(f.id) : undefined} />
        ))}
      </div>
      <p className="max-w-3xl text-xs text-muted">
        Every study was checked against PubMed and the publisher’s abstract. Questions the library doesn’t cover will be answered by searching papers live, marked as not yet vetted.
      </p>
    </div>
  )
}
