import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[20px] border border-line/70 bg-surface p-4 md:p-6 ${className}`}>
      {title && (
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function StatTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-[20px] border border-line/70 bg-surface p-4 md:p-5">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="tabular font-display mt-2 text-3xl font-bold tracking-tight">
        {value}
        {unit && <span className="ml-1 font-sans text-sm font-medium text-muted">{unit}</span>}
      </div>
    </div>
  )
}

/** Placeholder for pages whose section hasn't been built yet. */
export function EmptyState({ icon: Icon, title, body, children }: { icon: LucideIcon; title: string; body: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[20px] border border-dashed border-line bg-surface px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-xl bg-accent-soft text-accent-strong">
        <Icon className="size-6" />
      </span>
      <h2 className="mt-4 text-xl font-bold tracking-tight">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted">{body}</p>
      {children}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-full bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
            value === o.value ? 'bg-contrast text-on-contrast' : 'text-muted hover:text-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
