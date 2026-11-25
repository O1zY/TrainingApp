import { Cloud } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Field } from '../components/fields'
import { NAME_MAX, useSettings } from '../settings/SettingsContext'
import { signInAndSync } from '../sync/runner'

const input = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base md:py-2 md:text-sm'
const primary = 'inline-flex items-center justify-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-50'

/**
 * Email and password, for signing in or making an account. Making one also asks what to
 * call you; that goes into the settings, so sync carries it to every device you sign in on.
 */
export function SignInForm({ create, onCreateChange, error }: { create: boolean; onCreateChange: (create: boolean) => void; error?: string }) {
  const { settings, update } = useSettings()
  const [name, setName] = useState(settings.name ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(undefined)
    try {
      // Before the account exists, so the first sync sends the name up with everything else.
      if (create && name.trim()) update({ name: name.trim() })
      const r = await signInAndSync(email.trim(), password, create)
      if (r === 'confirm') setMessage('Account made. Open the link in the email Supabase just sent, then sign in here.')
      else setPassword('')
    } catch (err) {
      setMessage((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3">
      {error && !message && <p className="rounded-lg bg-over/15 px-3 py-2 text-sm">{error}</p>}
      {create && (
        <Field label="What should we call you?">
          <input
            type="text"
            autoComplete="given-name"
            required
            maxLength={NAME_MAX}
            className={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
      )}
      <Field label="Email">
        <input type="email" autoComplete="email" required className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" hint={create ? 'At least 8 characters.' : undefined}>
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
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" disabled={busy} className={primary}>
          <Cloud className="size-4" /> {busy ? 'One moment…' : create ? 'Create account and sync' : 'Sign in and sync'}
        </button>
        <button type="button" className="text-sm font-medium text-accent-strong" onClick={() => onCreateChange(!create)}>
          {create ? 'I already have an account' : 'New here? Create an account'}
        </button>
      </div>
      {message && (
        <p className="text-sm" aria-live="polite">
          {message}
        </p>
      )}
    </form>
  )
}
