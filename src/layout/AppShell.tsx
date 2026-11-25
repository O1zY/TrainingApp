import { LogIn, Plus, Settings as SettingsIcon } from 'lucide-react'
import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { StorageBanner } from '../components/StorageBanner'
import { displayName, useSettings } from '../settings/SettingsContext'
import { useSyncStatus } from '../sync/runner'
import { syncConfigured } from '../sync/supabase'
import { initialOf } from '../welcome/greeting'
import { Welcome } from '../welcome/Welcome'
import { useWelcomeVisible } from '../welcome/useWelcomeVisible'
import { openWelcome } from '../welcome/welcomeState'
import { NAV } from './nav'

const APP_NAME = 'Training Tracker'

function Brand() {
  return (
    <div className="font-display flex items-center gap-2.5 text-[17px] font-bold tracking-tight">
      <img src="/favicon.svg" alt="" className="size-8 rounded-[10px] ring-1 ring-white/10" />
      {APP_NAME}
    </div>
  )
}

/** Sidebar link: quiet on the ink panel, a violet marker when active. */
const sideLink = ({ isActive }: { isActive: boolean }) =>
  `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
    isActive ? 'bg-ink-2 text-on-ink' : 'text-ink-muted hover:bg-ink-2/60 hover:text-on-ink'
  }`

function Marker() {
  return <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent opacity-0 transition group-aria-[current=page]:opacity-100" />
}

/** Who's signed in, or a Sign in button while nobody is. Null when there's no account to speak of. */
function useAccount() {
  const { settings } = useSettings()
  const status = useSyncStatus()
  const name = displayName(settings)
  const signedIn = syncConfigured && status.state !== 'off'
  const label = name ?? status.email
  const detail = !syncConfigured ? 'This device only' : status.state === 'syncing' ? 'Syncing…' : status.state === 'error' ? 'Not synced' : 'Synced'
  return { signedIn, label, detail, initial: initialOf(label) }
}

function Avatar({ initial, className = '' }: { initial: string; className?: string }) {
  return (
    <span className={`font-display grid shrink-0 place-items-center rounded-full bg-accent font-bold text-on-accent ${className}`} aria-hidden>
      {initial || '•'}
    </span>
  )
}

/** Sidebar footer: your name and sync state, or a bold Sign in while signed out. */
function AccountChip() {
  const { signedIn, label, detail, initial } = useAccount()
  if (syncConfigured && !signedIn) {
    return (
      <button
        type="button"
        onClick={openWelcome}
        className="mb-2 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-3 py-2.5 text-sm font-semibold text-on-accent transition hover:brightness-110"
      >
        <LogIn className="size-4" strokeWidth={2.5} />
        Sign in
      </button>
    )
  }
  if (!label) return null
  return (
    <NavLink to="/settings" className="mb-2 flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-ink-2/60">
      <Avatar initial={initial} className="size-9 text-sm" />
      <span className="min-w-0 text-left">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className="block text-xs text-ink-muted">{detail}</span>
      </span>
    </NavLink>
  )
}

/** Laptop and tablet: fixed sidebar on the left. */
function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-ink px-4 py-6 text-on-ink md:flex">
      <div className="px-2">
        <Brand />
      </div>

      <NavLink
        to="/log"
        className="mt-8 flex items-center justify-center gap-2 rounded-full bg-accent px-3 py-2.5 text-sm font-semibold text-on-accent transition hover:brightness-110"
      >
        <Plus className="size-4" strokeWidth={2.75} />
        Log session
      </NavLink>

      <nav className="mt-8 flex flex-1 flex-col gap-1">
        {NAV.filter((n) => !n.primary).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={sideLink}
          >
            <Marker />
            <Icon className="size-4.5" />
            {label}
          </NavLink>
        ))}
      </nav>

      <AccountChip />

      <NavLink
        to="/settings"
        className={sideLink}
      >
        <Marker />
        <SettingsIcon className="size-4.5" />
        Settings
      </NavLink>
    </aside>
  )
}

/** Phone: slim top bar. */
function TopBar() {
  const { signedIn, label, initial } = useAccount()
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between bg-ink px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-on-ink md:hidden">
      <Brand />
      <div className="flex items-center gap-1">
        {syncConfigured && !signedIn ? (
          <button type="button" onClick={openWelcome} className="mr-1 inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-on-accent">
            <LogIn className="size-4" strokeWidth={2.5} />
            Sign in
          </button>
        ) : (
          label && (
            <NavLink to="/settings" aria-label={`${label}, account settings`} className="mr-1">
              <Avatar initial={initial} className="size-8 text-sm" />
            </NavLink>
          )
        )}
        <NavLink to="/settings" aria-label="Settings" className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-ink-2">
          <SettingsIcon className="size-5" />
        </NavLink>
      </div>
    </header>
  )
}

/** Phone: bottom tab bar with the Log button raised in the middle. */
function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 bg-ink pb-[env(safe-area-inset-bottom)] text-on-ink md:hidden">
      {NAV.map(({ to, label, icon: Icon, primary }) =>
        primary ? (
          <NavLink key={to} to={to} aria-label="Log session" className="flex justify-center">
            <span className="-mt-5 grid size-14 place-items-center rounded-full bg-accent text-on-accent shadow-lg shadow-accent/30 ring-4 ring-ink">
              <Icon className="size-6" strokeWidth={2.5} />
            </span>
          </NavLink>
        ) : (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${isActive ? 'text-on-ink [&>svg]:text-accent' : 'text-ink-muted'}`
            }
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ),
      )}
    </nav>
  )
}

function PageLoading() {
  return <div className="h-40 animate-pulse rounded-[20px] bg-surface-2/60" aria-label="Loading" />
}

export function AppShell() {
  const { pathname } = useLocation()
  const welcome = useWelcomeVisible()
  // The Strava sign-in comes back to this app with a code in the address; leave that alone.
  if (welcome && !pathname.startsWith('/strava/callback')) return <Welcome />
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
          <StorageBanner />
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <TabBar />
    </div>
  )
}
