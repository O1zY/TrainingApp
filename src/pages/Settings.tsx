import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ParsedInput } from '../components/fields'
import { SPORTS } from '../log/sports'
import { ZONE_SPORTS, ZONE_TABLES, bandsFor, type ZoneBand, type ZoneSport } from '../markers/zones'
import { Card, PageHeader, Segmented } from '../components/ui'
import { StravaConnection } from './log/Strava'
import { DataCard } from './DataCard'
import { SyncCard } from './SyncCard'
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
            <Row label="Max heart rate" hint="Used to suggest zones. Saving a max HR fitness marker updates it. Edit the zones directly if you've had them tested.">
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

        <div id="zones" className="scroll-mt-20">
          <ZonesSettings />
        </div>

        <Card title="Strava">
          <StravaConnection />
        </Card>

        <SyncCard />
        <DataCard />
      </div>
    </>
  )
}

/** A zone bound: blank means open-ended. Signed for the erg's seconds either side of the 2k split. */
function BandInput({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <ParsedInput<number>
      aria-label={label}
      value={value ?? undefined}
      placeholder="—"
      className="tabular w-14! px-1! text-center"
      format={(v) => String(v)}
      parse={(t) => {
        const n = Number(t.trim().replace('−', '-'))
        return t.trim() && Number.isFinite(n) ? n : undefined
      }}
      onChange={(v) => onChange(v ?? null)}
    />
  )
}

function ZonesSettings() {
  const { settings, update } = useSettings()
  const setBands = (sport: ZoneSport, bands: ZoneBand[] | undefined) => {
    const zones = { ...settings.zones }
    if (bands) zones[sport] = bands
    else delete zones[sport]
    update({ zones: Object.keys(zones).length ? zones : undefined })
  }
  return (
    <Card title="Pace and power zones">
      <p className="text-sm text-muted">
        Worked out from your <Link to="/log/markers" className="font-medium text-accent-strong">fitness markers</Link>, so a session aimed at a zone shows the pace or watts to hold.
        Blank means open-ended. The defaults are coaching conventions, named under each table.
      </p>
      <div className="mt-4 divide-y divide-line">
        <Row label="Re-test every" hint="Markers older than this are flagged as due a re-test.">
          <Segmented<string>
            value={String(settings.retestWeeks)}
            onChange={(v) => update({ retestWeeks: Number(v) })}
            options={[4, 6, 8, 12].map((w) => ({ value: String(w), label: `${w} wk` }))}
          />
        </Row>
        {ZONE_SPORTS.map((sport) => {
          const t = ZONE_TABLES[sport]
          const bands = bandsFor(sport, settings.zones)
          const edited = !!settings.zones?.[sport]
          return (
            <div key={sport} className="py-4 last:pb-0">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">{SPORTS[sport].label}</p>
                {edited && (
                  <button type="button" onClick={() => setBands(sport, undefined)} className="text-sm font-medium text-accent-strong">
                    Reset
                  </button>
                )}
              </div>
              <p className="text-xs text-muted">{t.unit}</p>
              <div className="mt-2 grid grid-cols-5 gap-1.5 text-center">
                {bands.map(([lo, hi], i) => (
                  <div key={i} className="rounded-lg bg-surface-2 px-1 py-2">
                    <p className="text-xs font-semibold">Z{i + 1}</p>
                    <p className="truncate text-[11px] text-muted" title={t.names[i]}>
                      {t.names[i]}
                    </p>
                    <div className="mt-1 flex flex-col items-center gap-1">
                      <BandInput label={`${SPORTS[sport].label} zone ${i + 1} from`} value={lo} onChange={(v) => setBands(sport, bands.map((b, j) => (j === i ? [v, b[1]] : b)))} />
                      <BandInput label={`${SPORTS[sport].label} zone ${i + 1} to`} value={hi} onChange={(v) => setBands(sport, bands.map((b, j) => (j === i ? [b[0], v] : b)))} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted">Default: {t.source}</p>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
