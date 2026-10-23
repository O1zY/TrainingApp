import { Sun } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { dateKey, ENERGY, SORENESS, useCheckIns, type CheckIn } from '../checkin/checkins'
import { Card } from './ui'

const num = (v: string) => (v.trim() === '' ? undefined : Number(v))
const str = (v?: number) => (v === undefined ? '' : String(v))

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}

const inputClass = 'tabular w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm'

/** 1–5 picker; the chosen label shows under the buttons. */
function Scale({ label, labels, value, onChange }: { label: string; labels: string[]; value?: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-medium text-muted">{label}</span>
        <span className="font-semibold">{value ? labels[value - 1] : ''}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={label}>
        {labels.map((l, i) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={value === i + 1}
            aria-label={l}
            onClick={() => onChange(i + 1)}
            className={`rounded-lg py-2 text-sm font-semibold transition ${
              value === i + 1 ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted hover:text-text'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  )
}

function Form({ initial, onSave }: { initial: CheckIn; onSave: (c: CheckIn) => void }) {
  const [c, setC] = useState(initial)
  const set = (patch: Partial<CheckIn>) => setC((x) => ({ ...x, ...patch }))
  const h = c.sleepS === undefined ? '' : String(Math.floor(c.sleepS / 3600))
  const m = c.sleepS === undefined ? '' : String(Math.round((c.sleepS % 3600) / 60))
  const setSleep = (hh: string, mm: string) =>
    set({ sleepS: hh === '' && mm === '' ? undefined : (Number(hh) || 0) * 3600 + (Number(mm) || 0) * 60 })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave(c)
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Sleep">
          <div className="flex items-center gap-1">
            <input className={inputClass} inputMode="numeric" placeholder="h" value={h} onChange={(e) => setSleep(e.target.value, m)} aria-label="Sleep hours" />
            <input className={inputClass} inputMode="numeric" placeholder="m" value={m} onChange={(e) => setSleep(h, e.target.value)} aria-label="Sleep minutes" />
          </div>
        </Field>
        <Field label="Sleep score">
          <input className={inputClass} inputMode="numeric" placeholder="0–100" value={str(c.sleepScore)} onChange={(e) => set({ sleepScore: num(e.target.value) })} />
        </Field>
        <Field label="Resting HR">
          <input className={inputClass} inputMode="numeric" placeholder="bpm" value={str(c.restingHR)} onChange={(e) => set({ restingHR: num(e.target.value) })} />
        </Field>
        <Field label="HRV">
          <input className={inputClass} inputMode="numeric" placeholder="ms" value={str(c.hrv)} onChange={(e) => set({ hrv: num(e.target.value) })} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Scale label="Soreness" labels={SORENESS} value={c.soreness} onChange={(soreness) => set({ soreness })} />
        <Scale label="Energy" labels={ENERGY} value={c.energy} onChange={(energy) => set({ energy })} />
      </div>
      <Field label="Notes">
        <input className={inputClass} placeholder="Anything worth remembering — niggles, stress, travel" value={c.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} />
      </Field>
      <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:opacity-90">
        Save check-in
      </button>
    </form>
  )
}

const sleepText = (s: number) => `${Math.floor(s / 3600)}:${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`

function Summary({ c }: { c: CheckIn }) {
  const items: [string, string | undefined, string?][] = [
    ['Sleep', c.sleepS !== undefined ? sleepText(c.sleepS) : undefined, 'h'],
    ['Sleep score', str(c.sleepScore) || undefined],
    ['Resting HR', str(c.restingHR) || undefined, 'bpm'],
    ['HRV', str(c.hrv) || undefined, 'ms'],
    ['Soreness', c.soreness ? `${c.soreness} · ${SORENESS[c.soreness - 1]}` : undefined],
    ['Energy', c.energy ? `${c.energy} · ${ENERGY[c.energy - 1]}` : undefined],
  ]
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        {items
          .filter(([, v]) => v)
          .map(([label, v, unit]) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="tabular font-semibold">
                {v}
                {unit && <span className="ml-0.5 text-xs font-medium text-muted">{unit}</span>}
              </dd>
            </div>
          ))}
      </dl>
      {c.notes && <p className="text-sm text-muted">{c.notes}</p>}
    </div>
  )
}

/** Start-of-day check-in on Home: a short form until it's done, then a one-line summary. */
export function CheckInCard() {
  const { all, save } = useCheckIns()
  const today = dateKey()
  const existing = all[today]
  const [editing, setEditing] = useState(false)

  if (existing && !editing) {
    return (
      <Card
        title="Morning check-in"
        action={
          <button type="button" onClick={() => setEditing(true)} className="text-sm font-medium text-accent-strong">
            Edit
          </button>
        }
      >
        <Summary c={existing} />
      </Card>
    )
  }

  return (
    <Card title="Morning check-in" action={<Sun className="size-4.5 text-muted" />}>
      <Form
        initial={existing ?? { date: today, source: 'manual' }}
        onSave={(c) => {
          save(c)
          setEditing(false)
        }}
      />
    </Card>
  )
}
