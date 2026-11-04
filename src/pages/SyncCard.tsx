import { Cloud, CloudOff, LogOut, RefreshCw } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Field } from '../components/fields'
import { Card } from '../components/ui'
import { KEYS } from '../storage'
import { signInAndSync, signOutOfSync, syncNow, useSyncStatus } from '../sync/runner'
import { syncConfigured } from '../sync/supabase'

const btn = 'inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50'
const primary = 'inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-50'
const input = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base md:py-2 md:text-sm'

const STORE_NAME: Record<string, string> = { [KEYS.settings]: 'settings', [KEYS.log]: 'log', [KEYS.plan]: 'plan', [KEYS.strava]: 'Strava imports' }
const names = (keys: string[]) => keys.map((k) => STORE_NAME[k] ?? k).join(', ')

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  return h < 24 ? `${h}h ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Settings › Sync across devices: sign in to an account that keeps the data in step. */
export function SyncCard() {
  const status = useSyncStatus()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [create, setCreate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()

  if (!syncConfigured) {
    return (
      <Card title="Sync across devices">
        <p className="text-sm text-muted">
          Keep phone and laptop in step through a free Supabase database of your own. Make a project at supabase.com, run{' '}
          <code className="rounded bg-surface-2 px-1">supabase/schema.sql</code> in its SQL editor, and put the project URL and anon key in{' '}
          <code className="rounded bg-surface-2 px-1">VITE_SUPABASE_URL</code> and <code className="rounded bg-surface-2 px-1">VITE_SUPABASE_ANON_KEY</code> (see{' '}
          <code className="rounded bg-surface-2 px-1">.env.example</code>). Until then, backups move data between devices.
        </p>
      </Card>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(undefined)
    try {
      const r = await signInAndSync(email.trim(), password, create)
      if (r === 'confirm') setMessage('Account made. Open the link in the email Supabase just sent, then sign in here.')
      else setPassword('')
    } catch (err) {
      setMessage((err as Error).message)
    }
    setBusy(false)
  }

  if (status.state === 'off') {
    return (
      <Card title="Sync across devices">
        <p className="text-sm text-muted">
          Sign in on each device to keep your log, plan, library and settings the same everywhere. Changes made on two devices between syncs are combined, session by
          session. What’s already in this browser is added to the account the first time. Strava sign-in stays on the device that connected it.
        </p>
        {status.error && <p className="mt-3 rounded-lg bg-over/15 px-3 py-2 text-sm">{status.error}</p>}
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Email">
            <input type="email" autoComplete="email" required className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <input
              type="password"
              autoComplete={create ? 'new-password' : 'current-password'}
              required
              minLength={create ? 8 : undefined}
              className={input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="submit" disabled={busy} className={primary}>
              <Cloud className="size-4" /> {create ? 'Create account and sync' : 'Sign in and sync'}
            </button>
            <button type="button" className="text-sm font-medium text-accent-strong" onClick={() => setCreate(!create)}>
              {create ? 'I already have an account' : 'New here? Create an account'}
            </button>
          </div>
        </form>
        {message && (
          <p className="mt-3 text-sm" aria-live="polite">
            {message}
          </p>
        )}
      </Card>
    )
  }

  const last = status.last
  return (
    <Card title="Sync across devices">
      <div className="flex items-start gap-3">
        {status.state === 'error' ? <CloudOff className="mt-0.5 size-5 shrink-0 text-over" /> : <Cloud className="mt-0.5 size-5 shrink-0 text-hit" />}
        <div className="min-w-0 flex-1 text-sm">
          <p>
            Signed in as <span className="font-semibold">{status.email}</span>
          </p>
          <p className="text-muted" aria-live="polite">
            {status.state === 'syncing'
              ? 'Syncing…'
              : status.state === 'error'
                ? `Not synced: ${status.error}. Your changes are safe here and go across next time.`
                : status.lastSync
                  ? `Synced ${ago(status.lastSync)}${last?.received.length ? `: brought in changes to your ${names(last.received)}` : last?.sent.length ? `: sent your ${names(last.sent)}` : ', all up to date'}.`
                  : 'Waiting to sync.'}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">Syncs when the app opens, a few seconds after each change, when you come back to it, and every five minutes.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={status.state === 'syncing'} onClick={() => void syncNow()}>
          <RefreshCw className={`size-4 ${status.state === 'syncing' ? 'animate-spin' : ''}`} /> Sync now
        </button>
        <button type="button" className={btn} onClick={() => void signOutOfSync()}>
          <LogOut className="size-4" /> Sign out
        </button>
      </div>
      <p className="mt-3 text-xs text-muted">Signing out stops syncing; everything stays in this browser.</p>
    </Card>
  )
}
