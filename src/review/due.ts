import { addDays, weekStart } from '../plan/dates'
import type { PlannedSession, WeeklyReview } from '../plan/types'

/** From this hour on the week's last day, that week can be reviewed. */
export const REVIEW_HOUR = 17

/**
 * The week waiting for a review, if any: this week from the evening of its last day,
 * otherwise last week. Only weeks with planned sessions, and not already reviewed or skipped.
 */
export function reviewDue(now: Date, today: string, weekStartsOn: 0 | 1, planned: PlannedSession[], reviews: WeeklyReview[]): string | undefined {
  const ws = weekStart(today, weekStartsOn)
  const lastDay = addDays(ws, 6) === today
  const week = lastDay && now.getHours() >= REVIEW_HOUR ? ws : addDays(ws, -7)
  const end = addDays(week, 6)
  if (!planned.some((p) => p.date >= week && p.date <= end)) return undefined
  if (reviews.some((r) => r.weekStart === week)) return undefined
  return week
}
