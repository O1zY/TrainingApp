/** Rounded filter/choice chip, highlighted when on. */
export function chip(on: boolean) {
  return `shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
    on ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line text-muted hover:text-text'
  }`
}
