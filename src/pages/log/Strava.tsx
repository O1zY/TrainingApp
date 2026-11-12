import { ArrowLeft, ExternalLink, GitMerge, Plus, RefreshCw, Unplug, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Field, inputClass } from '../../components/fields'
import { Card, PageHeader } from '../../components/ui'
import { PACE_LABEL, distanceUnit, formatDate, formatDistance, formatPace, formatTime, paceKind, paceValue, todayIso } from '../../log/format'
import type { SessionDraft } from '../../log/LogStore'
import { useLog } from '../../log/LogStore'
import { SPORTS, sessionName } from '../../log/sports'
import type { Session } from '../../log/types'
import { useSettings } from '../../settings/SettingsContext'
import { activityUrl, authorizeUrl, finishSignIn } from '../../strava/api'
import { useStrava, type SyncResult } from '../../strava/StravaStore'

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}h ago`
  return formatDate(todayIso(new Date(iso)), { day: 'numeric', month: 'short' })
}

/** Strava's guidelines ask for this wording, in their orange, wherever its data is shown. */
export function ViewOnStrava({ id, className = '' }: { id: string; className?: string }) {
  return (
    <a href={activityUrl(id)} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 text-sm font-semibold text-strava underline-offset-2 hover:underline ${className}`}>
      View on Strava <ExternalLink className="size-3.5" />
    </a>
  )
}

function resultLine(r: SyncResult) {
  if (r.error) return r.message
  const parts = [
    r.created && `${r.created} imported`,
    r.merged && `${r.merged} matched to sessions you’d logged`,
    r.grouped?.length && `${r.grouped.join(', ')} put back together from ${r.grouped.length === 1 ? 'its' : 'their'} legs`,
    r.linked && `${r.linked} ticked off the plan`,
    r.review && `${r.review} to check`,
  ].filter(Boolean)
  return `${parts.length ? parts.join(' · ') : 'Nothing new'}${r.message ? `. ${r.message}` : ''}`
}

function SetupHelp() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname)
  const code = (t: string) => <code className="rounded bg-surface-2 px-1">{t}</code>
  return (
    <div className="space-y-2 text-sm text-muted">
      <p>Strava import needs a Strava API app and this site’s server to hold its secret.</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          Create an app at{' '}
          <a href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer" className="font-medium text-accent-strong underline">
            strava.com/settings/api
          </a>{' '}
          with <span className="font-medium text-text">Authorization Callback Domain</span> set to {code(location.hostname)}.
        </li>
        {local ? (
          <>
            <li>
              Put its Client ID and Client Secret in {code('.env.local')} as {code('STRAVA_CLIENT_ID')} and {code('STRAVA_CLIENT_SECRET')} (see {code('.env.example')}).
            </li>
            <li>Restart the dev server.</li>
          </>
        ) : (
          <>
            <li>
              In Netlify, <span className="font-medium text-text">Site configuration › Environment variables</span>, add its Client ID and Client Secret as {code('STRAVA_CLIENT_ID')} and{' '}
              {code('STRAVA_CLIENT_SECRET')}.
            </li>
            <li>
              Redeploy (<span className="font-medium text-text">Deploys › Trigger deploy</span>), then reload this page.
            </li>
          </>
        )}
      </ol>
    </div>
  )
}

/** Settings › Connections. */
export function StravaConnection() {
  const strava = useStrava()
  const { server, connected, athlete } = strava
  const [busy, setBusy] = useState(false)

  if (!server) return <p className="text-sm text-muted">Checking Strava set-up…</p>
  if (!server.configured) return <SetupHelp />

  const importFrom = (
    <Field label="Import activities from" hint="Moving this earlier brings in older activities on the next sync." className="max-w-xs">
      <input type="date" className={inputClass} value={strava.importFrom} max={todayIso()} onChange={(e) => e.target.value && strava.setImportFrom(e.target.value)} />
    </Field>
  )

  if (!connected) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Bring in everything recorded on Strava. Sessions you’ve already logged by hand are matched up rather than duplicated, and the gaps (HR, laps, elevation) filled in.
        </p>
        {importFrom}
        <a
          href={authorizeUrl(server.clientId!)}
          className="inline-flex items-center gap-2 rounded-lg bg-strava px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Connect with Strava
        </a>
      </div>
    )
  }

  const disconnect = async () => {
    if (!confirm('Disconnect Strava? Sessions already imported stay in your log.')) return
    setBusy(true)
    await strava.disconnect()
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {athlete?.profile_medium && <img src={athlete.profile_medium} alt="" className="size-10 rounded-full" />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Connected{athlete?.firstname ? ` as ${[athlete.firstname, athlete.lastname].filter(Boolean).join(' ')}` : ''}</p>
          <p className="text-sm text-muted">{strava.syncing ? 'Syncing…' : strava.lastSync ? `Last synced ${ago(strava.lastSync)}` : 'Not synced yet'}</p>
        </div>
        <Link to="/log/strava" className="rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2">
          Open
        </Link>
      </div>
      {importFrom}
      <button
        type="button"
        onClick={disconnect}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text disabled:opacity-50"
      >
        <Unplug className="size-4" /> Disconnect
      </button>
    </div>
  )
}

/** Slim row on the Log page. */
export function StravaBanner() {
  const strava = useStrava()
  if (!strava.server?.configured && !strava.connected) return null
  const waiting = strava.review.length
  return (
    <Link
      to={strava.connected ? '/log/strava' : '/settings'}
      className="flex items-center gap-3 rounded-[20px] border border-line/70 bg-surface px-4 py-3 text-sm hover:bg-surface-2"
    >
      <span className="size-2.5 shrink-0 rounded-full bg-strava" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">Strava</span>{' '}
        <span className="text-muted">
          {!strava.connected
            ? '· Connect to import your activities'
            : strava.syncing
              ? '· Syncing…'
              : strava.lastSync
                ? `· Synced ${ago(strava.lastSync)}`
                : '· Not synced yet'}
        </span>
      </span>
      {waiting > 0 && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-on-accent">{waiting} to check</span>}
    </Link>
  )
}

function summary(s: Pick<Session, 'sport' | 'distanceM' | 'durationSec' | 'startTime' | 'rpe' | 'hrAvg'>, units: 'metric' | 'imperial') {
  const unit = distanceUnit(s.sport, units)
  const kind = paceKind(s.sport, units)
  const pace = kind ? paceValue(kind, s.distanceM, s.durationSec) : undefined
  return [
    s.startTime?.slice(0, 5),
    s.distanceM != null && `${formatDistance(s.distanceM, unit)}${unit}`,
    s.durationSec != null && formatTime(s.durationSec, false),
    kind && pace != null && `${formatPace(kind, pace)}${PACE_LABEL[kind]}`,
    s.hrAvg != null && `HR ${s.hrAvg}`,
    s.rpe != null && `RPE ${s.rpe}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

function ReviewCard({ activityId, draft, candidateIds }: { activityId: string; draft: SessionDraft; candidateIds: string[] }) {
  const { sessions } = useLog()
  const { settings } = useSettings()
  const { resolveReview } = useStrava()
  const def = SPORTS[draft.sport]
  const candidates = candidateIds.map((id) => sessions.find((s) => s.id === id)).filter((s): s is Session => !!s)
  const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-surface-2'

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${def.soft} ${def.text}`}>
          <def.icon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {sessionName(draft)} <span className="font-normal text-muted">on Strava</span>
          </p>
          <p className="tabular text-sm text-muted">
            {formatDate(draft.date)} · {summary(draft, settings.units) || 'No details'}
          </p>
          <ViewOnStrava id={activityId} className="mt-1" />
        </div>
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Same as one you logged?</p>
      <div className="mt-2 space-y-2">
        {candidates.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
            <Link to={`/log/session/${s.id}`} className="min-w-0 flex-1 text-sm">
              <span className="block font-medium">{sessionName(s)}</span>
              <span className="tabular block text-muted">{summary(s, settings.units) || 'No details'}</span>
            </Link>
            <button type="button" onClick={() => resolveReview(activityId, { merge: s.id })} className={`${btn} bg-surface`}>
              <GitMerge className="size-4" /> Same session
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => resolveReview(activityId, 'new')} className={btn}>
          <Plus className="size-4" /> Different, import it
        </button>
        <button type="button" onClick={() => resolveReview(activityId, 'skip')} className={`${btn} text-muted`}>
          <X className="size-4" /> Skip it
        </button>
      </div>
    </div>
  )
}

export default function StravaPage() {
  const strava = useStrava()
  const { sessions } = useLog()
  const imported = sessions.filter((s) => s.externalId).length

  return (
    <div className="space-y-5">
      <Link to="/log" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Log
      </Link>
      <PageHeader
        title="Strava"
        subtitle="Activities come in automatically when the app opens"
        action={
          strava.connected && (
            <button
              type="button"
              onClick={() => strava.sync()}
              disabled={strava.syncing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90 disabled:opacity-60"
            >
              <RefreshCw className={`size-4 ${strava.syncing ? 'animate-spin' : ''}`} /> {strava.syncing ? 'Syncing…' : 'Sync now'}
            </button>
          )
        }
      />

      {!strava.connected ? (
        <Card title="Not connected">
          <StravaConnection />
        </Card>
      ) : (
        <Card title="Sync">
          <div className="space-y-1 text-sm">
            <p>
              <span className="font-semibold">{imported}</span> <span className="text-muted">sessions linked to Strava, from {formatDate(strava.importFrom, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </p>
            {strava.lastResult && (
              <p className={strava.lastResult.error ? 'font-medium text-miss' : 'text-muted'}>
                {ago(strava.lastResult.at)}: {resultLine(strava.lastResult)}
              </p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link to="/settings" className="font-medium text-accent-strong">
              Connection settings
            </Link>
            <button
              type="button"
              onClick={() => strava.forgetSkipped()}
              className="font-medium text-muted hover:text-text"
              title="Skipped activities, and ones whose session you deleted, are normally left out for good"
            >
              Bring back skipped activities
            </button>
          </div>
        </Card>
      )}

      {strava.review.length > 0 && (
        <Card title={`To check · ${strava.review.length}`}>
          <p className="mb-4 text-sm text-muted">These might be sessions you’d already logged. “Same session” keeps everything you typed and fills in the rest from Strava.</p>
          <div className="space-y-3">
            {strava.review.map((r) => (
              <ReviewCard key={r.activityId} {...r} />
            ))}
          </div>
        </Card>
      )}

      <Card title="How matching works">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>An activity on the same day and in the same sport as a session you logged by hand is the same session when the start time, duration or distance agree, or it’s the only one either way round.</li>
          <li>Merging never overwrites what you typed (RPE, notes, pieces and targets stay). Empty fields are filled in from Strava, and laps become pieces if you hadn’t logged any.</li>
          <li>New activities on a day with one planned session in that sport are ticked off the plan.</li>
          <li>Run → bike → run and swim → bike → run on the same day, each leg starting within 15 minutes of the last finishing, become a duathlon or triathlon with the transitions worked out from the gaps. If the plan has that race on the day, it takes the race’s name and ticks off its session.</li>
          <li>Rowing with no GPS (a Concept2 upload, say) comes in as erg. Laps that look like a workout become pieces; automatic 1km or mile splits don’t.</li>
        </ul>
      </Card>
    </div>
  )
}

/** Where Strava sends the browser back after sign-in. */
export function StravaCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const strava = useStrava()
  const [error, setError] = useState<string>()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    finishSignIn(params)
      .then(({ tokens, athlete }) => {
        strava.connect(tokens, athlete)
        navigate('/log/strava', { replace: true })
        void strava.sync()
      })
      .catch((e: Error) => setError(e.message))
  }, [params, navigate, strava])

  return (
    <Card title="Connecting Strava">
      {error ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-miss">{error}</p>
          <Link to="/settings" className="text-sm font-semibold text-accent-strong">
            Back to Settings
          </Link>
        </div>
      ) : (
        <p className="text-sm text-muted">Finishing sign-in…</p>
      )}
    </Card>
  )
}
