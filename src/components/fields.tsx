import { ChevronDown } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { formatTime, parseTime } from '../log/format'

// Form inputs shared by the logging forms. Number and time inputs keep their own
// text while focused so typing "7:1" isn't reformatted mid-entry, and push a parsed
// value up on every keystroke so worked-out fields (split, watts, %1RM) update live.

export const inputClass =
  'tabular w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2.5 text-base outline-none transition placeholder:text-muted/60 focus:border-accent md:py-2 md:text-sm'

export function Field({ label, unit, hint, children, className = '' }: { label: string; unit?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 flex items-baseline justify-between gap-2 text-xs font-medium text-muted">
        <span>{label}</span>
        {unit && <span className="text-muted/80">{unit}</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

/** Like Field, for a row of buttons: a <label> would give its text to the first button as its name. */
export function FieldGroup({ label, hint, children, className = '' }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={`min-w-0 ${className}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </div>
  )
}

interface ParsedProps<T> {
  value: T | undefined
  onChange: (v: T | undefined) => void
  parse: (text: string) => T | undefined
  format: (v: T) => string
  placeholder?: string
  inputMode?: 'decimal' | 'numeric' | 'text'
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

export function ParsedInput<T>({ value, onChange, parse, format, placeholder, inputMode = 'decimal', disabled, className = '', ...rest }: ParsedProps<T>) {
  // While focused the raw text is shown; otherwise the formatted value, so outside changes always show.
  const [text, setText] = useState<string | undefined>()
  const shown = text ?? (value == null ? '' : format(value))

  return (
    <input
      {...rest}
      className={`${inputClass} ${className}`}
      inputMode={inputMode}
      placeholder={placeholder}
      disabled={disabled}
      value={shown}
      onFocus={() => setText(shown)}
      onBlur={() => setText(undefined)}
      onChange={(e) => {
        setText(e.target.value)
        const parsed = parse(e.target.value)
        if (parsed !== undefined || e.target.value.trim() === '') onChange(parsed)
      }}
    />
  )
}

/** Number stored in base units; `factor` converts display units → base units. */
export function NumberInput({
  value,
  onChange,
  factor = 1,
  decimals = 2,
  integer,
  ...rest
}: Omit<ParsedProps<number>, 'parse' | 'format'> & { factor?: number; decimals?: number; integer?: boolean }) {
  return (
    <ParsedInput<number>
      {...rest}
      inputMode={integer ? 'numeric' : 'decimal'}
      value={value}
      onChange={onChange}
      parse={(t) => {
        const n = Number(t.trim().replace(',', '.'))
        if (!t.trim() || !Number.isFinite(n) || n < 0) return undefined
        return (integer ? Math.round(n) : n) * factor
      }}
      format={(v) => String(Math.round((v / factor) * 10 ** decimals) / 10 ** decimals)}
    />
  )
}

/** Duration in seconds, typed as h:mm:ss, m:ss.t or a bare number (minutes by default). */
export function TimeInput({ bare = 'min', placeholder = 'm:ss', ...rest }: Omit<ParsedProps<number>, 'parse' | 'format'> & { bare?: 'min' | 'sec' }) {
  return <ParsedInput<number> {...rest} inputMode="text" placeholder={placeholder} parse={(t) => parseTime(t, bare)} format={(v) => formatTime(v)} />
}

export function Chips<T extends string>({
  value,
  options,
  onChange,
  allowNone = true,
}: {
  value: T | undefined
  options: { value: T; label: string }[]
  onChange: (v: T | undefined) => void
  allowNone?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(on && allowNone ? undefined : o.value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              on ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line text-muted hover:text-text'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function MultiChips({ value, options, onChange }: { value: string[]; options: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o)
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              on ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line text-muted hover:text-text'
            }`}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

/** Row of numbered buttons, e.g. RPE 1–10 or a 1–5 wellbeing scale. Tap again to clear. */
export function Scale({
  value,
  onChange,
  min = 1,
  max = 10,
  low,
  high,
  describe,
}: {
  value: number | undefined
  onChange: (v: number | undefined) => void
  min?: number
  max?: number
  low?: string
  high?: string
  describe?: (v: number) => string
}) {
  const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? undefined : n)}
            className={`tabular rounded-lg py-2.5 text-sm font-semibold transition ${
              value === n ? 'bg-accent text-on-accent' : value != null && n < value ? 'bg-accent-soft text-accent-strong' : 'bg-surface-2 text-muted hover:text-text'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{low}</span>
        {value != null && describe && <span className="font-medium text-text">{describe(value)}</span>}
        <span>{high}</span>
      </div>
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
      <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

/** Collapsible section for the "full detail" parts of a form. */
export function Section({ title, summary, defaultOpen = false, children }: { title: string; summary?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left md:px-5">
        <span className="font-semibold">{title}</span>
        <span className="flex min-w-0 items-center gap-2 text-sm text-muted">
          {!open && summary && <span className="truncate">{summary}</span>}
          <ChevronDown className={`size-4 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div id={id} className="border-t border-line px-4 py-4 md:px-5">
          {children}
        </div>
      )}
    </section>
  )
}

export function TextArea({ value, onChange, placeholder, rows = 3 }: { value: string | undefined; onChange: (v: string | undefined) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      className={`${inputClass} resize-y`}
      rows={rows}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  )
}

export function TextInput({ value, onChange, placeholder, list }: { value: string | undefined; onChange: (v: string | undefined) => void; placeholder?: string; list?: string }) {
  return <input className={inputClass} list={list} placeholder={placeholder} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />
}
