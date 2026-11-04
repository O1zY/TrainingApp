import { formatDate } from '../../log/format'

// Number formats shared by the analysis tabs.

export const weekLabel = (start: string) => formatDate(start, { day: 'numeric', month: 'short' })
export const weekTitle = (start: string) => `Week of ${formatDate(start, { day: 'numeric', month: 'short', year: 'numeric' })}`
export const dayTitle = (date: string) => formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' })

export const fmtHours = (h: number) => (h === 0 ? '0' : `${Math.round(h * 10) / 10}h`)
export const fmtInt = (v: number) => Math.round(v).toLocaleString('en-GB')
export const fmtPct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—')
