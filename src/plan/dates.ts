// Calendar maths on local YYYY-MM-DD strings, so nothing shifts across time zones or clock changes.

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function addDays(date: string, n: number) {
  const d = parse(date)
  d.setDate(d.getDate() + n)
  return iso(d)
}

/** 0 = Sunday, like Date.getDay(). */
export const weekday = (date: string) => parse(date).getDay()

/** First day of the week containing `date`. */
export function weekStart(date: string, weekStartsOn: 0 | 1) {
  return addDays(date, -((weekday(date) - weekStartsOn + 7) % 7))
}

export function daysBetween(from: string, to: string) {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86400000)
}

export const weekDates = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i))

/** "07:30" → 450 minutes after midnight. */
export function clockMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function minClock(min: number) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
