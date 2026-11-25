/** "Morning", "Afternoon" or "Evening" for the time of day. */
export function partOfDay(d: Date): 'morning' | 'afternoon' | 'evening' {
  const h = d.getHours()
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
}

/** "Good morning, Ollie" (or just "Good morning" while no name is set). */
export function greeting(d: Date, name?: string): string {
  const base = `Good ${partOfDay(d)}`
  const who = name?.trim()
  return who ? `${base}, ${who}` : base
}

/** First letter for the avatar circle. */
export const initialOf = (name?: string) => (name?.trim()[0] ?? '').toUpperCase()
