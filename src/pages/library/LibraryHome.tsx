import { BookOpen, Plus, Search, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { inputClass } from '../../components/fields'
import { Card, EmptyState, PageHeader } from '../../components/ui'
import { STARTER_WORKOUTS, missingStarters } from '../../library/starter'
import { allTags, structureSummary } from '../../library/workouts'
import { formatDate } from '../../log/format'
import { useLog } from '../../log/LogStore'
import { LOGGABLE, SPORTS } from '../../log/sports'
import type { Sport, Workout } from '../../log/types'
import { useSettings } from '../../settings/SettingsContext'
import { useZoneContext } from '../../markers/useZones'

function chip(on: boolean) {
  return `shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
    on ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line text-muted hover:text-text'
  }`
}

function WorkoutCard({ w }: { w: Workout }) {
  const { settings } = useSettings()
  const zones = useZoneContext()
  const { sessions } = useLog()
  const def = SPORTS[w.sport]
  const logged = sessions.filter((s) => s.workoutId === w.id)
  const last = logged.map((s) => s.date).sort().at(-1)
  const type = def.types.find((t) => t.value === w.type)?.label

  return (
    <div className="flex flex-col rounded-2xl border border-line bg-surface p-4 transition hover:border-accent/50">
      <Link to={`/library/${w.id}`} className="flex flex-1 items-start gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${def.soft} ${def.text}`}>
          <def.icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{w.name}</span>
          <span className="block text-xs text-muted">{[def.label, type].filter(Boolean).join(' · ')}</span>
          <span className="tabular mt-2 block text-sm">{structureSummary(w, settings.units, zones) || <span className="text-muted">No structure yet</span>}</span>
        </span>
      </Link>
      {w.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {w.tags.map((t) => (
            <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <span className="text-xs text-muted">{logged.length ? `Logged ${logged.length}× · last ${formatDate(last!)}` : 'Not logged yet'}</span>
        <Link to={`/log/new?workout=${w.id}`} className="rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-strong hover:opacity-90">
          Log it
        </Link>
      </div>
    </div>
  )
}

/** Offered until any starter workout is in the library, so deleting some later doesn't bring the offer back. */
function StarterOffer({ onAdd, compact }: { onAdd: () => void; compact?: boolean }) {
  const sports = [...new Set(STARTER_WORKOUTS.map((w) => SPORTS[w.sport].label))]
  const button = (
    <button type="button" onClick={onAdd} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90">
      <Sparkles className="size-4" /> Add {STARTER_WORKOUTS.length} starter workouts
    </button>
  )
  if (compact) return button
  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-semibold">Start with a triathlon and duathlon set</h2>
          <p className="mt-1 text-sm text-muted">
            Sessions from the Brownlee brothers, Alex Yee and the Norwegian triathlon team, plus the field tests that set your zones ({sports.join(', ').toLowerCase()}). Each says where it comes from, and the targets
            follow your fitness markers.
          </p>
        </div>
        {button}
      </div>
    </Card>
  )
}

export default function LibraryHome() {
  const { workouts, saveWorkout } = useLog()
  const addStarters = () => {
    for (const w of missingStarters(workouts)) saveWorkout({ ...w, createdAt: undefined })
  }
  const offerStarters = !workouts.some((w) => STARTER_WORKOUTS.some((s) => s.id === w.id))
  const [q, setQ] = useState('')
  const [sport, setSport] = useState<Sport>()
  const [tags, setTags] = useState<string[]>([])

  const newButton = (
    <Link to="/library/new" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90">
      <Plus className="size-4" /> New workout
    </Link>
  )

  if (!workouts.length) {
    return (
      <>
        <PageHeader title="Library" subtitle="Reusable workouts and templates" />
        <EmptyState
          icon={BookOpen}
          title="Your library is empty"
          body="Save the sessions you do often, or ones from research, with their structure and targets. Then log them in one tap, with the targets already filled in."
        >
          <div className="mt-5 flex flex-col items-center gap-3">
            <StarterOffer onAdd={addStarters} compact />
            <span className="text-xs text-muted">or</span>
            {newButton}
            <p className="text-xs text-muted">Open any logged session and tap “Save to library” to add your own.</p>
          </div>
        </EmptyState>
      </>
    )
  }

  const sports = LOGGABLE.filter((s) => workouts.some((w) => w.sport === s))
  const tagList = allTags(workouts)
  const needle = q.trim().toLowerCase()
  const shown = workouts
    .filter((w) => !sport || w.sport === sport)
    .filter((w) => tags.every((t) => w.tags.includes(t)))
    .filter((w) => !needle || [w.name, w.description, w.source, ...w.tags].some((x) => x?.toLowerCase().includes(needle)))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <PageHeader title="Library" subtitle={`${workouts.length} workout${workouts.length === 1 ? '' : 's'}`} action={newButton} />

      {offerStarters && (
        <div className="mb-5">
          <StarterOffer onAdd={addStarters} />
        </div>
      )}

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input className={`${inputClass} pl-9`} placeholder="Search name, tag, notes or source" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {sports.length > 1 && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
            <button type="button" className={chip(!sport)} onClick={() => setSport(undefined)}>
              All
            </button>
            {sports.map((s) => (
              <button key={s} type="button" className={chip(sport === s)} onClick={() => setSport(sport === s ? undefined : s)}>
                {SPORTS[s].label}
              </button>
            ))}
          </div>
        )}
        {tagList.length > 0 && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
            {tagList.map((t) => (
              <button key={t} type="button" className={chip(tags.includes(t))} onClick={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])}>
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length ? (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((w) => (
            <WorkoutCard key={w.id} w={w} />
          ))}
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">No workouts match those filters.</p>
      )}
    </>
  )
}
