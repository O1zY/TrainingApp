import { useSearchParams } from 'react-router-dom'
import { chip } from '../../components/styles'
import { PageHeader, Segmented } from '../../components/ui'
import { GROUPS, RANGES, counted, groupOf, rangeOf, type Group, type RangeValue } from '../../analysis/series'
import { todayIso } from '../../log/format'
import { useLog } from '../../log/LogStore'
import { usePlan } from '../../plan/PlanStore'
import { useSettings } from '../../settings/SettingsContext'
import LoadTab from './LoadTab'
import PlanTab from './PlanTab'
import ProgressTab from './ProgressTab'

type Tab = 'load' | 'progress' | 'plan'

export default function Analysis() {
  const { sessions, wellbeing, maxes, workouts } = useLog()
  const { planned, commitments } = usePlan()
  const { settings } = useSettings()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab | null) ?? 'load'
  const weeksBack = (RANGES.find((r) => r.value === params.get('range'))?.value ?? '12') as RangeValue
  const group = GROUPS.find((g) => g.key === params.get('sport'))?.key
  const set = (k: string, v: string | undefined) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (v) next.set(k, v)
        else next.delete(k)
        return next
      },
      { replace: true },
    )

  const today = todayIso()
  const range = rangeOf(Number(weeksBack), today, settings.weekStartsOn)
  const all = counted(sessions)
  const present = GROUPS.filter((g) => all.some((s) => groupOf(s.sport) === g.key))
  const scoped = counted(sessions, group)
  const scopedPlan = group ? planned.filter((p) => groupOf(p.sport) === group) : planned

  return (
    <>
      <PageHeader title="Analysis" subtitle="Load, progress and planned vs done" />
      <div className="space-y-5">
        <Segmented<Tab>
          value={tab}
          onChange={(t) => set('tab', t === 'load' ? undefined : t)}
          options={[
            { value: 'load', label: 'Load' },
            { value: 'progress', label: 'Progress' },
            { value: 'plan', label: 'Plan vs done' },
          ]}
        />

        {/* One filter row; it scopes everything below. */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Segmented<RangeValue> value={weeksBack} onChange={(v) => set('range', v === '12' ? undefined : v)} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
          {present.length > 1 && (
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
              <button type="button" className={chip(!group)} onClick={() => set('sport', undefined)}>
                All sports
              </button>
              {present.map((g) => (
                <button key={g.key} type="button" className={chip(group === g.key)} onClick={() => set('sport', group === g.key ? undefined : (g.key as Group))}>
                  {g.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {tab === 'load' && <LoadTab sessions={scoped} wellbeing={group ? [] : wellbeing} commitments={group ? [] : commitments} range={range} />}
        {tab === 'progress' && <ProgressTab sessions={scoped} maxes={maxes} workouts={workouts} range={range} group={group} />}
        {tab === 'plan' && <PlanTab planned={scopedPlan} sessions={sessions} range={range} today={today} />}
      </div>
    </>
  )
}
