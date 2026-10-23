import type { ReactNode } from 'react'
import { Card, PageHeader, Segmented } from '../components/ui'
import { zonesFromMax } from '../settings/hrZones'
import { useSettings, type ThemePref, type Units } from '../settings/SettingsContext'

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted">{hint}</p>
      </div>
      {children}
    </div>
  )
}

function BpmInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={60}
      max={240}
      value={value}
      onChange={(e) => e.target.value && onChange(Number(e.target.value))}
      className="tabular w-16 rounded-md border border-line bg-surface px-2 py-1 text-center text-sm font-semibold"
      aria-label="Beats per minute"
    />
  )
}

export default function Settings() {
  const { settings, update } = useSettings()

  return (
    <>
      <PageHeader title="Settings" />
      <div className="max-w-2xl space-y-5">
        <Card title="Display">
          <div className="divide-y divide-line">
            <Row label="Theme" hint="System follows your device's light or dark mode.">
              <Segmented<ThemePref>
                value={settings.theme}
                onChange={(theme) => update({ theme })}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </Row>
            <Row label="Units" hint="Distance, pace and weight. Rowing splits are always /500m.">
              <Segmented<Units>
                value={settings.units}
                onChange={(units) => update({ units })}
                options={[
                  { value: 'metric', label: 'Metric (km, kg)' },
                  { value: 'imperial', label: 'Imperial (mi, lb)' },
                ]}
              />
            </Row>
            <Row label="Week starts on" hint="Used by the weekly view and weekly totals.">
              <Segmented<'1' | '0'>
                value={String(settings.weekStartsOn) as '1' | '0'}
                onChange={(v) => update({ weekStartsOn: v === '1' ? 1 : 0 })}
                options={[
                  { value: '1', label: 'Monday' },
                  { value: '0', label: 'Sunday' },
                ]}
              />
            </Row>
          </div>
        </Card>

        <Card title="Heart rate zones">
          <div className="divide-y divide-line">
            <Row label="Max heart rate" hint="Used to suggest zones. Edit the zones directly if you've had them tested.">
              <div className="flex items-center gap-2">
                <BpmInput value={settings.maxHR} onChange={(maxHR) => update({ maxHR })} />
                <button
                  type="button"
                  onClick={() => update({ hrZoneTops: zonesFromMax(settings.maxHR) })}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
                >
                  Set zones from max
                </button>
              </div>
            </Row>
            <div className="grid grid-cols-5 gap-2 pt-4 text-center">
              {[1, 2, 3, 4, 5].map((z) => {
                const tops = settings.hrZoneTops
                return (
                  <div key={z} className="rounded-lg bg-surface-2 px-1 py-2">
                    <p className="text-xs font-semibold">Z{z}</p>
                    <p className="tabular mt-1 text-xs text-muted">{z === 1 ? '0' : tops[z - 2] + 1}–</p>
                    {z < 5 ? (
                      <BpmInput
                        value={tops[z - 1]}
                        onChange={(v) => update({ hrZoneTops: tops.map((t, i) => (i === z - 1 ? v : t)) })}
                      />
                    ) : (
                      <p className="tabular py-1 text-sm font-semibold">{settings.maxHR}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </Card>

        <Card title="Connections">
          <p className="text-sm text-muted">Strava import will be set up here in section 6.</p>
        </Card>
      </div>
    </>
  )
}
