import { Dumbbell, HeartPulse } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Chips } from '../../components/fields'
import { Card, PageHeader } from '../../components/ui'
import { todayIso } from '../../log/format'
import { useLog } from '../../log/LogStore'
import { LOGGABLE, SPORTS } from '../../log/sports'
import type { Sport } from '../../log/types'
import { Feed } from './Feed'
import { SportPicker } from './SessionForm'
import { WellbeingSummary } from './Wellbeing'

export default function LogHome() {
  const navigate = useNavigate()
  const { wellbeing, sessions } = useLog()
  const [filter, setFilter] = useState<Sport | undefined>()
  const today = todayIso()
  const checkin = wellbeing.find((w) => w.date === today)
  const usedSports = LOGGABLE.filter((s) => sessions.some((x) => x.sport === s))

  return (
    <div className="space-y-5">
      <PageHeader title="Log" subtitle="Record what you actually did" />

      <Card title="Log a session">
        <SportPicker onPick={(sport) => navigate(`/log/new?sport=${sport}`)} />
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card
          title="Today’s check-in"
          action={
            <Link to={`/log/wellbeing/${today}${checkin ? '' : '/edit'}`} className="text-sm font-medium text-accent-strong">
              {checkin ? 'Open' : 'Start'}
            </Link>
          }
        >
          {checkin ? (
            <WellbeingSummary w={checkin} />
          ) : (
            <Link to={`/log/wellbeing/${today}/edit`} className="flex items-center gap-3 text-sm">
              <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-strong">
                <HeartPulse className="size-5" />
              </span>
              <span>
                <span className="block font-semibold">Not done yet</span>
                <span className="text-muted">Sleep, resting HR, soreness, mood… about 20 seconds.</span>
              </span>
            </Link>
          )}
        </Card>
        <Card title="Strength">
          <Link to="/log/maxes" className="flex items-center gap-3 text-sm">
            <span className="grid size-10 place-items-center rounded-xl bg-sport-strength/15 text-sport-strength">
              <Dumbbell className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">1RMs</span>
              <span className="text-muted">Saved maxes, used to log sets as a % of 1RM.</span>
            </span>
          </Link>
        </Card>
      </div>

      <Card title="History">
        {usedSports.length > 1 && (
          <div className="mb-4">
            <Chips value={filter} options={usedSports.map((s) => ({ value: s, label: SPORTS[s].label }))} onChange={setFilter} />
          </div>
        )}
        <Feed filter={filter} />
      </Card>
    </div>
  )
}
