import { useEffect, useState } from 'react'
import { todayIso } from '../log/format'
import { useLog } from '../log/LogStore'
import { daysBetween } from '../plan/dates'
import { usePlan } from '../plan/PlanStore'
import { displayName, useSettings } from '../settings/SettingsContext'
import { useSyncStatus } from '../sync/runner'
import { greeting } from './greeting'
import { SignInForm } from './SignInForm'
import { skipWelcome } from './welcomeState'

/**
 * The first thing you see when you're not signed in: a greeting made for you (your name,
 * the time of day, what's coming up) and the sign-in form, so signing in is the obvious
 * thing to do. The name is remembered on this device and travels with the account to
 * every other one.
 */
export function Welcome() {
  const { settings } = useSettings()
  const status = useSyncStatus()
  const { sessions } = useLog()
  const { events } = usePlan()
  const [create, setCreate] = useState(false)

  // Signing out from far down Settings would otherwise leave this screen scrolled.
  useEffect(() => {
    scrollTo(0, 0)
  }, [])

  const now = new Date()
  const name = displayName(settings)
  const today = todayIso(now)
  const nextRace = events.find((e) => e.kind === 'race' && e.date >= today)
  const toGo = nextRace ? daysBetween(today, nextRace.date) : 0
  const logged = sessions.filter((s) => s.status === 'completed').length

  const headline = create ? 'Let’s get you set up' : greeting(now, name)
  const lead = create
    ? 'One account keeps your log, plan and settings the same on your phone and laptop.'
    : name
      ? 'Welcome back. Sign in to pick up where you left off.'
      : 'Sign in to bring your training with you, on any device.'

  return (
    <div className="flex min-h-dvh flex-col bg-bg md:flex-row">
      <section className="flex flex-col justify-between bg-ink px-6 pb-10 pt-[max(2rem,env(safe-area-inset-top))] text-on-ink md:w-[46%] md:px-12 md:py-14">
        <div className="font-display flex items-center gap-2.5 text-[17px] font-bold tracking-tight">
          <img src="/favicon.svg" alt="" className="size-8 rounded-[10px] ring-1 ring-white/10" />
          Training Tracker
        </div>

        <div className="mt-14 md:mt-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="mt-3 text-4xl font-bold md:text-6xl">
            {headline}
            <span className="text-accent">.</span>
          </h1>
          <p className="mt-4 max-w-md text-base text-ink-muted">{lead}</p>
        </div>

        <ul className="mt-10 space-y-1.5 text-sm text-ink-muted md:mt-0">
          {logged > 0 && (
            <li>
              <span className="tabular font-semibold text-on-ink">{logged}</span> session{logged === 1 ? '' : 's'} logged on this device
            </li>
          )}
          {nextRace && (
            <li>
              <span className="tabular font-semibold text-on-ink">{toGo === 0 ? 'Today' : `${toGo} day${toGo === 1 ? '' : 's'}`}</span>
              {toGo === 0 ? ': ' : ' to '}
              {nextRace.name}
            </li>
          )}
        </ul>
      </section>

      <section className="flex flex-1 items-center justify-center px-5 py-10 md:px-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold tracking-tight">{create ? 'Create your account' : 'Sign in'}</h2>
          <p className="mb-5 mt-1 text-sm text-muted">
            {create
              ? 'Anything already in this browser is added to the account the first time.'
              : 'Your log, plan, library and settings, the same on every device.'}
          </p>
          <SignInForm create={create} onCreateChange={setCreate} error={status.error} />
          <div className="mt-8 border-t border-line pt-5">
            <button type="button" onClick={skipWelcome} className="text-sm font-medium text-muted hover:text-text">
              Use without signing in
            </button>
            <p className="mt-1 text-xs text-muted">Everything stays in this browser until you do.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
