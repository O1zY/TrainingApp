import { Activity, Settings as SettingsIcon } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { NAV } from './nav'

const APP_NAME = 'Training Tracker'

function Brand() {
  return (
    <div className="flex items-center gap-2.5 font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-accent text-on-accent">
        <Activity className="size-4.5" strokeWidth={2.5} />
      </span>
      {APP_NAME}
    </div>
  )
}

/** Laptop and tablet: fixed sidebar on the left. */
function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 md:flex">
      <div className="px-2">
        <Brand />
      </div>

      <NavLink
        to="/log"
        className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-on-accent transition hover:opacity-90"
      >
        Log session
      </NavLink>

      <nav className="mt-6 flex flex-1 flex-col gap-1">
        {NAV.filter((n) => !n.primary).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:bg-surface-2 hover:text-text'
              }`
            }
          >
            <Icon className="size-4.5" />
            {label}
          </NavLink>
        ))}
      </nav>

      <NavLink
        to="/settings"
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
            isActive ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:bg-surface-2 hover:text-text'
          }`
        }
      >
        <SettingsIcon className="size-4.5" />
        Settings
      </NavLink>
    </aside>
  )
}

/** Phone: slim top bar. */
function TopBar() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
      <Brand />
      <NavLink to="/settings" aria-label="Settings" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2">
        <SettingsIcon className="size-5" />
      </NavLink>
    </header>
  )
}

/** Phone: bottom tab bar with the Log button raised in the middle. */
function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {NAV.map(({ to, label, icon: Icon, primary }) =>
        primary ? (
          <NavLink key={to} to={to} aria-label="Log session" className="flex justify-center">
            <span className="-mt-5 grid size-14 place-items-center rounded-full bg-accent text-on-accent shadow-lg ring-4 ring-bg">
              <Icon className="size-6" strokeWidth={2.5} />
            </span>
          </NavLink>
        ) : (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${isActive ? 'text-accent-strong' : 'text-muted'}`
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

export function AppShell() {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
          <Outlet />
        </main>
      </div>
      <TabBar />
    </div>
  )
}
