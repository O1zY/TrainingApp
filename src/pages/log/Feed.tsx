import { HeartPulse, Waypoints } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PACE_LABEL, distanceUnit, formatDate, formatDistance, formatPace, formatTime, paceKind, paceValue, todayIso } from '../../log/format'
import { useLog } from '../../log/LogStore'
import { SPORTS, eventName, sessionName } from '../../log/sports'
import { multisportTimeline, sortSessions, wellnessScore } from '../../log/stats'
import type { Multisport, Session, Sport, Wellbeing } from '../../log/types'
import { useSettings } from '../../settings/SettingsContext'

type Item = { kind: 'session'; s: Session } | { kind: 'event'; m: Multisport; legs: Session[] } | { kind: 'wellbeing'; w: Wellbeing }

/** Everything logged, newest first, with multisport legs folded into their event. */
function useFeed(filter?: Sport) {
  const { sessions, multisport, wellbeing } = useLog()
  const byDate = new Map<string, Item[]>()
  const add = (date: string, item: Item) => byDate.set(date, [...(byDate.get(date) ?? []), item])

  for (const s of sortSessions(sessions)) {
    if (filter && s.sport !== filter) continue
    if (s.multisportId && multisport.some((m) => m.id === s.multisportId)) continue
    add(s.date, { kind: 'session', s })
  }
  for (const m of multisport) {
    const legs = m.legIds.map((id) => sessions.find((s) => s.id === id)).filter((s): s is Session => !!s)
    if (filter && !legs.some((l) => l.sport === filter)) continue
    add(m.date, { kind: 'event', m, legs })
  }
  if (!filter) for (const w of wellbeing) add(w.date, { kind: 'wellbeing', w })

  return [...byDate.entries()].sort(([a], [b]) => b.localeCompare(a))
}

function sessionLine(s: Session, units: ReturnType<typeof useSettings>['settings']['units']) {
  const kind = paceKind(s.sport, units)
  const unit = distanceUnit(s.sport, units)
  const pace = kind ? paceValue(kind, s.distanceM, s.durationSec) : undefined
  return [
    s.distanceM != null && `${formatDistance(s.distanceM, unit)}${unit}`,
    s.durationSec != null && formatTime(s.durationSec, false),
    kind && pace != null && `${formatPace(kind, pace)}${PACE_LABEL[kind]}`,
    s.pieces?.length && `${s.pieces.length} pieces`,
    s.exercises?.length && `${s.exercises.length} exercises`,
    s.rpe != null && `RPE ${s.rpe}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

function Row({ item }: { item: Item }) {
  const { settings } = useSettings()
  if (item.kind === 'session') {
    const def = SPORTS[item.s.sport]
    return (
      <Link to={`/log/session/${item.s.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2">
        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${def.soft} ${def.text}`}>
          <def.icon className="size-4.5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{sessionName(item.s)}</span>
          <span className="tabular block truncate text-xs text-muted">{sessionLine(item.s, settings.units) || 'No details yet'}</span>
        </span>
      </Link>
    )
  }
  if (item.kind === 'event') {
    const { totalSec } = multisportTimeline(item.legs)
    return (
      <Link to={`/log/multi/${item.m.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
          <Waypoints className="size-4.5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{eventName(item.m)}</span>
          <span className="tabular block truncate text-xs text-muted">
            {item.legs.map((l) => SPORTS[l.sport].label).join(' → ')}
            {totalSec != null && ` · ${formatTime(totalSec, false)}`}
          </span>
        </span>
      </Link>
    )
  }
  const score = wellnessScore(item.w)
  return (
    <Link to={`/log/wellbeing/${item.w.date}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-strong">
        <HeartPulse className="size-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">Check-in</span>
        <span className="tabular block truncate text-xs text-muted">
          {[score != null && `Wellness ${score}/5`, item.w.sleepHours != null && `Sleep ${item.w.sleepHours}h`, item.w.restingHr != null && `RHR ${item.w.restingHr}`]
            .filter(Boolean)
            .join(' · ') || 'Notes only'}
        </span>
      </span>
    </Link>
  )
}

export function Feed({ filter, limitDays }: { filter?: Sport; limitDays?: number }) {
  const days = useFeed(filter).slice(0, limitDays)
  const today = todayIso()
  if (!days.length) return <p className="py-2 text-sm text-muted">Nothing logged yet.</p>
  return (
    <div className="space-y-4">
      {days.map(([date, items]) => (
        <div key={date}>
          <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted">{date === today ? 'Today' : formatDate(date, { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
          {items.map((item) => (
            <Row key={item.kind === 'session' ? item.s.id : item.kind === 'event' ? item.m.id : `w-${item.w.date}`} item={item} />
          ))}
        </div>
      ))}
    </div>
  )
}
