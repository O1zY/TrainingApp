import { ArrowLeft, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkline } from '../../components/charts'
import { Field, ParsedInput, Section, inputClass } from '../../components/fields'
import { Card, PageHeader } from '../../components/ui'
import { formatDate, todayIso } from '../../log/format'
import { useLog } from '../../log/LogStore'
import { SPORTS } from '../../log/sports'
import { describeTarget } from '../../log/targets'
import type { MarkerKind, MarkerSource, Session } from '../../log/types'
import { suggestFromLog, suggestFromSession, type Suggestion } from '../../markers/estimate'
import {
  MARKERS,
  MARKER_FOR_SPORT,
  SOURCE_LABEL,
  STALE_WEEKS,
  currentMarker,
  describeChange,
  formatMarker,
  isDue,
  isStale,
  markerDef,
  markerHistory,
  markerUnit,
  parseMarker,
  weeksOld,
} from '../../markers/markers'
import { ZONE_SPORTS, ZONE_TABLES, zoneTarget } from '../../markers/zones'
import { useSaveMarker } from '../../markers/useZones'
import { useSettings } from '../../settings/SettingsContext'

const shortDate = (iso: string) => formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric' })

/** Markers suggested by the log (or by one session), each saved with a tap. */
export function MarkerSuggestions({ session, title = 'From your log' }: { session?: Session; title?: string }) {
  const { sessions, markers } = useLog()
  const { settings } = useSettings()
  const save = useSaveMarker()
  const today = todayIso()
  const all = suggestFromLog(sessions, markers, today, settings.maxHR)
  const list: Suggestion[] = session ? suggestFromSession(session).filter((g) => all.some((a) => a.kind === g.kind && a.sessionId === g.sessionId)) : all
  if (!list.length) return null

  const use = (g: Suggestion) => save({ kind: g.kind, value: g.value, date: g.date, source: g.source, sessionId: g.sessionId, notes: g.how })

  return (
    <Card title={title}>
      <ul className="divide-y divide-line">
        {list.map((g) => {
          const cur = currentMarker(markers, g.kind)
          const change = cur ? describeChange(g.kind, cur.value, g.value, settings.units) : undefined
          return (
            <li key={`${g.kind}-${g.sessionId}`} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-strong max-sm:hidden">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {markerDef(g.kind).label}{' '}
                  <span className="tabular">{formatMarker(g.kind, g.value, settings.units)}</span>
                  {change && <span className={`ml-2 text-xs font-medium ${change.better ? 'text-hit' : 'text-muted'}`}>{change.text}</span>}
                </p>
                <p className="text-xs text-muted">
                  {shortDate(g.date)} · {SOURCE_LABEL[g.source]} · {g.how}
                </p>
              </div>
              <button type="button" onClick={() => use(g)} className="self-start rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-surface-2 sm:self-center">
                Save as marker
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** A marker's current value, change and trend. */
function MarkerTile({ kind }: { kind: MarkerKind }) {
  const { markers } = useLog()
  const { settings } = useSettings()
  const today = todayIso()
  const def = markerDef(kind)
  const hist = markerHistory(markers, kind)
  const cur = hist.at(-1)
  const prev = hist.at(-2)
  const change = cur && prev ? describeChange(kind, prev.value, cur.value, settings.units) : undefined
  const due = cur && isDue(cur, today, settings.retestWeeks)
  // Charted so "up" is always fitter.
  const trend = hist.map((m) => (def.higherIsBetter ? m.value : -m.value))
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{def.short}</p>
        {due && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-strong">Re-test due</span>}
      </div>
      {cur ? (
        <>
          <div className="mt-1 flex items-end justify-between gap-2">
            <p className="tabular font-display text-2xl font-bold">{formatMarker(kind, cur.value, settings.units, false)}</p>
            <Sparkline values={trend} width={72} height={24} />
          </div>
          <p className="text-xs text-muted">
            {markerUnit(kind, settings.units) && `${markerUnit(kind, settings.units)} · `}
            {shortDate(cur.date)} · {SOURCE_LABEL[cur.source]}
          </p>
          {change && <p className={`mt-1 text-xs font-medium ${change.better ? 'text-hit' : 'text-muted'}`}>{change.text} since {shortDate(prev!.date)}</p>}
          {def.sport && isStale(cur, today) && <p className="mt-1 text-xs text-muted">{Math.floor(weeksOld(cur, today))} weeks old: targets show as estimates</p>}
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">Not set</p>
      )}
    </div>
  )
}

function AddMarker() {
  const { settings } = useSettings()
  const save = useSaveMarker()
  const [kind, setKind] = useState<MarkerKind>('runThreshold')
  const [value, setValue] = useState<number | undefined>()
  const [date, setDate] = useState(todayIso())
  const [source, setSource] = useState<MarkerSource>('test')
  const unit = markerUnit(kind, settings.units)
  const placeholder = { runThreshold: '4:10', ftp: '250', erg2k: '6:45.0', css: '1:45', maxHr: '195', restHr: '48' }[kind]

  const submit = () => {
    if (!value || !date) return
    save({ kind, value, date, source })
    setValue(undefined)
  }

  return (
    <Card title="Add a result">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <Field label="Marker" className="col-span-2 sm:col-span-1">
          <select className={inputClass} value={kind} onChange={(e) => (setKind(e.target.value as MarkerKind), setValue(undefined))}>
            {MARKERS.map((m) => (
              <option key={m.kind} value={m.kind}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Value" unit={unit || 'time'}>
          <ParsedInput<number>
            key={kind}
            aria-label="Value"
            inputMode={kind === 'ftp' || kind === 'maxHr' || kind === 'restHr' ? 'numeric' : 'text'}
            value={value}
            placeholder={placeholder}
            parse={(t) => parseMarker(kind, t, settings.units)}
            format={(v) => formatMarker(kind, v, settings.units, false)}
            onChange={setValue}
          />
        </Field>
        <Field label="Date">
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="From">
          <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value as MarkerSource)}>
            {(Object.keys(SOURCE_LABEL) as MarkerSource[]).map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <div className="col-span-2 flex items-end sm:col-span-1">
          <button type="button" onClick={submit} disabled={!value} className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90 disabled:opacity-50 md:py-2">
            Save
          </button>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">{markerDef(kind).how}</p>
    </Card>
  )
}

/** Each sport's zones as real paces or watts, from its current marker. */
function ZonesCard() {
  const { markers } = useLog()
  const { settings } = useSettings()
  const sports = ZONE_SPORTS.filter((s) => currentMarker(markers, MARKER_FOR_SPORT[s]!))
  return (
    <Card title="Your zones" action={<Link to="/settings#zones" className="text-sm font-medium text-accent-strong">Edit zones</Link>}>
      {sports.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {sports.map((sport) => {
            const t = ZONE_TABLES[sport]
            const m = currentMarker(markers, MARKER_FOR_SPORT[sport]!)!
            const def = SPORTS[sport]
            return (
              <div key={sport}>
                <p className={`mb-1.5 flex items-center gap-1.5 text-sm font-semibold ${def.text}`}>
                  <def.icon className="size-4" /> {def.label}
                </p>
                <ul className="divide-y divide-line rounded-xl border border-line text-sm">
                  {[1, 2, 3, 4, 5].map((z) => {
                    const target = zoneTarget(sport, z, m.value, settings.zones)
                    return (
                      <li key={z} className="flex items-center gap-3 px-3 py-1.5">
                        <span className="w-6 font-semibold">Z{z}</span>
                        <span className="flex-1 text-muted">{t.names[z - 1]}</span>
                        <span className="tabular font-medium">{target ? describeTarget(target, sport, settings.units) : '—'}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-muted">Add a run threshold, FTP, 2k or CSS and every session aimed at a zone in that sport shows the pace or watts to hold.</p>
      )}
    </Card>
  )
}

function History() {
  const { markers, deleteMarker } = useLog()
  const { settings } = useSettings()
  const kinds = MARKERS.filter((d) => markers.some((m) => m.kind === d.kind))
  if (!kinds.length) return null
  return (
    <Card title="History">
      <div className="space-y-2">
        {kinds.map((d) => {
          const hist = markerHistory(markers, d.kind).reverse()
          return (
            <Section key={d.kind} title={d.label} summary={`${hist.length} result${hist.length === 1 ? '' : 's'}`}>
              <ul className="divide-y divide-line">
                {hist.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="tabular font-semibold">{formatMarker(m.kind, m.value, settings.units)}</p>
                      <p className="text-xs text-muted">
                        {shortDate(m.date)} · {SOURCE_LABEL[m.source]}
                        {m.sessionId && (
                          <>
                            {' · '}
                            <Link to={`/log/session/${m.sessionId}`} className="text-accent-strong">
                              session
                            </Link>
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete ${d.label} from ${shortDate(m.date)}`}
                      onClick={() => confirm(`Delete this ${d.label.toLowerCase()} result?`) && deleteMarker(m.id)}
                      className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )
        })}
      </div>
    </Card>
  )
}

export default function Markers() {
  const { settings } = useSettings()
  return (
    <div className="space-y-5">
      <Link to="/log" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Log
      </Link>
      <PageHeader title="Fitness markers" subtitle="Threshold numbers per sport. They turn zones into real paces and watts, and their trend shows whether training is working." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {MARKERS.map((m) => (
          <MarkerTile key={m.kind} kind={m.kind} />
        ))}
      </div>
      <p className="text-xs text-muted">
        Re-test every {settings.retestWeeks} weeks (change it in Settings). Targets from a marker over {STALE_WEEKS} weeks old are marked as estimates.
      </p>

      <MarkerSuggestions />
      <AddMarker />
      <ZonesCard />
      <History />
    </div>
  )
}
