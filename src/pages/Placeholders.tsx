import { BookOpen, CalendarRange, ChartLine } from 'lucide-react'
import { EmptyState, PageHeader } from '../components/ui'

// Each of these is replaced by its own section in a later build session (see docs/SPEC.md).

export function Plan() {
  return (
    <>
      <PageHeader title="Plan" subtitle="Programmes, training blocks and target races" />
      <EmptyState
        icon={CalendarRange}
        title="Programme planner"
        body="Build blocks, weeks and sessions, and schedule them around races. Coming in section 4."
      />
    </>
  )
}

export function Library() {
  return (
    <>
      <PageHeader title="Library" subtitle="Reusable workouts and templates" />
      <EmptyState
        icon={BookOpen}
        title="Session library"
        body="Save workouts once, then drop them into plans or log them in one tap. Coming in section 3."
      />
    </>
  )
}

export function Analysis() {
  return (
    <>
      <PageHeader title="Analysis" subtitle="Load, progress and personal bests" />
      <EmptyState
        icon={ChartLine}
        title="Analysis"
        body="Training load, PBs and planned vs completed across every sport. Coming in section 5."
      />
    </>
  )
}
