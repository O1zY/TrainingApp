import { describe, expect, it } from 'vitest'
import { greeting, initialOf, partOfDay } from './greeting'

const at = (h: number, m = 0) => new Date(2026, 10, 25, h, m)

describe('greeting', () => {
  it('follows the time of day', () => {
    expect(partOfDay(at(0))).toBe('morning')
    expect(partOfDay(at(11, 59))).toBe('morning')
    expect(partOfDay(at(12))).toBe('afternoon')
    expect(partOfDay(at(17, 59))).toBe('afternoon')
    expect(partOfDay(at(18))).toBe('evening')
    expect(partOfDay(at(23, 59))).toBe('evening')
  })

  it('adds the name when there is one', () => {
    expect(greeting(at(8), 'Ollie')).toBe('Good morning, Ollie')
    expect(greeting(at(14), '  Ollie ')).toBe('Good afternoon, Ollie')
  })

  it('works without a name', () => {
    expect(greeting(at(20))).toBe('Good evening')
    expect(greeting(at(20), '   ')).toBe('Good evening')
  })

  it('takes the first letter for the avatar', () => {
    expect(initialOf(' ollie')).toBe('O')
    expect(initialOf(undefined)).toBe('')
  })
})
