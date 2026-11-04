import { beforeEach, describe, expect, it } from 'vitest'
import { dismissProblems, readJson, withArrays, writeJson } from './storage'
import { installMemoryStorage } from './test/memoryStorage'

let ls: ReturnType<typeof installMemoryStorage>
beforeEach(() => {
  ls = installMemoryStorage()
  dismissProblems()
})

const parse = (saved: Record<string, unknown>) => withArrays({ sessions: [] as unknown[], n: 1 }, saved)

describe('readJson', () => {
  it('uses defaults when nothing is saved', () => {
    expect(readJson('k', parse)).toEqual({ sessions: [], n: 1 })
  })

  it('lays saved values over defaults', () => {
    ls.setItem('k', JSON.stringify({ sessions: [1, 2] }))
    expect(readJson('k', parse)).toEqual({ sessions: [1, 2], n: 1 })
  })

  it('sets an unreadable save aside instead of losing it', () => {
    ls.setItem('k', '{"sessions": [1, 2')
    expect(readJson('k', parse)).toEqual({ sessions: [], n: 1 })
    const copies = [...ls.map.keys()].filter((k) => k.startsWith('k.corrupt-'))
    expect(copies).toHaveLength(1)
    expect(ls.getItem(copies[0])).toBe('{"sessions": [1, 2')
    // The original is still there until the app next saves over it.
    expect(ls.getItem('k')).toBe('{"sessions": [1, 2')
  })

  it('treats a non-object save as unreadable', () => {
    ls.setItem('k', '[1,2,3]')
    expect(readJson('k', parse)).toEqual({ sessions: [], n: 1 })
    expect([...ls.map.keys()].some((k) => k.startsWith('k.corrupt-'))).toBe(true)
  })
})

describe('withArrays', () => {
  it('replaces a field of the wrong shape with its default', () => {
    expect(withArrays({ a: [] as number[], b: 'x' }, { a: 'oops', b: 'y', extra: 1 })).toEqual({ a: [], b: 'y', extra: 1 })
  })
})

describe('writeJson', () => {
  it('reports false when the browser refuses the write', () => {
    expect(writeJson('k', { a: 1 })).toBe(true)
    ls.failWrites = true
    expect(writeJson('k', { a: 2 })).toBe(false)
    expect(JSON.parse(ls.getItem('k')!)).toEqual({ a: 1 })
  })
})

describe('onWrite and replaceStored', () => {
  it('tells listeners about saves, and replaceStored saves like any write', async () => {
    const { onWrite, replaceStored } = await import('./storage')
    const heard: string[] = []
    const off = onWrite((k) => heard.push(k))
    writeJson('a', { x: 1 })
    expect(replaceStored('b', { y: 2 })).toBe(true)
    off()
    writeJson('c', {})
    expect(heard).toEqual(['a', 'b'])
    expect(JSON.parse(ls.getItem('b')!)).toEqual({ y: 2 })
  })

  it('reports a refused write', async () => {
    const { replaceStored } = await import('./storage')
    ls.failWrites = true
    expect(replaceStored('b', { y: 2 })).toBe(false)
  })
})
