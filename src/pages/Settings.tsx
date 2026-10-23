import type { ReactNode } from 'react'
import { Card, PageHeader, Segmented } from '../components/ui'
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

        <Card title="Connections">
          <p className="text-sm text-muted">Strava import will be set up here in section 6.</p>
        </Card>
      </div>
    </>
  )
}
