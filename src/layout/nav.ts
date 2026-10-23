import { BookOpen, CalendarRange, ChartLine, House, Plus, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Shown as the raised centre button in the phone tab bar. */
  primary?: boolean
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/plan', label: 'Plan', icon: CalendarRange },
  { to: '/log', label: 'Log', icon: Plus, primary: true },
  { to: '/library', label: 'Library', icon: BookOpen },
  { to: '/analysis', label: 'Analysis', icon: ChartLine },
]
