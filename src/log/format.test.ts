import { describe, expect, it } from 'vitest'
import { clockToSec, ergWatts, estimate1Rm, formatHoursMinutes, formatSleep, formatTime, parseTime, secToClock } from './format'

describe('parseTime', () => {
  it.each([
    ['7:12.4', 432.4],
    ['1:02:03', 3723],
    ['45', 2700],
    ['45,5', 2730],
    [' 0:59 ', 59],
  ])('%s → %s s', (text, sec) => expect(parseTime(text)).toBeCloseTo(sec))

  it('reads a bare number as seconds when asked', () => expect(parseTime('90', 'sec')).toBe(90))
  it.each(['', 'abc', '1:2:3:4', '7:', '-5'])('rejects %j', (t) => expect(parseTime(t)).toBeUndefined())
})

describe('formatTime', () => {
  it.each([
    [432.4, '7:12.4'],
    [432, '7:12'],
    [3723, '1:02:03'],
    [59.96, '1:00'],
  ])('%s → %s', (sec, text) => expect(formatTime(sec)).toBe(text))
  it('is empty for nothing', () => expect(formatTime(undefined)).toBe(''))
  it('round-trips with parseTime', () => {
    for (const s of [95.3, 432.4, 1800, 3723]) expect(parseTime(formatTime(s))).toBeCloseTo(s)
  })
})

describe('clock times', () => {
  it('converts both ways', () => {
    expect(clockToSec('07:12')).toBe(25920)
    expect(clockToSec('07:12:30')).toBe(25950)
    expect(secToClock(25950)).toBe('07:12:30')
    expect(secToClock(86400 + 5)).toBe('00:00:05')
  })
})

describe('ergWatts', () => {
  // Concept2's own calculator: a 2:00 split is 203 W, 1:45 is 302 W.
  it('matches the Concept2 calculator', () => {
    expect(ergWatts(120)).toBe(203)
    expect(ergWatts(105)).toBe(302)
  })
})

describe('estimate1Rm', () => {
  it('uses Epley up to 12 reps', () => {
    expect(estimate1Rm(100, 1)).toBe(100)
    expect(estimate1Rm(100, 5)).toBe(116.5)
    expect(estimate1Rm(100, 13)).toBeUndefined()
  })
})

describe('formatHoursMinutes', () => {
  it.each([
    [0, '0:00'],
    [3000, '0:50'],
    [5430, '1:31'],
    [19800, '5:30'],
    [36000, '10:00'],
  ])('%s s → %s', (sec, text) => expect(formatHoursMinutes(sec)).toBe(text))
})

describe('formatSleep', () => {
  it('reads decimal hours as hours and minutes', () => {
    expect(formatSleep(7.5)).toBe('7h 30m')
    expect(formatSleep(8)).toBe('8h')
    expect(formatSleep(7 + 20 / 60)).toBe('7h 20m')
    expect(formatSleep(6 + 5 / 60)).toBe('6h 05m')
    expect(formatSleep(undefined)).toBe('')
  })
})
