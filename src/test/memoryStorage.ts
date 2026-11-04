/** A Map-backed localStorage for tests; `failWrites` makes setItem throw like a full disk. */
export function installMemoryStorage() {
  const map = new Map<string, string>()
  const store = {
    failWrites: false,
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem(k: string, v: string) {
      if (store.failWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError')
      map.set(k, String(v))
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    map,
  }
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true })
  return store
}
