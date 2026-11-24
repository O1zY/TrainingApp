import { describe, expect, it } from 'vitest'
import type { Injury } from '../coach/types'
import type { Piece, Session, Wellbeing } from '../log/types'
import { blockWeeks } from '../plan/cycle'
import { DEFAULT_PREFS } from '../plan/data'
import { addDays } from '../plan/dates'
import { planBlock } from '../plan/generate'
import type { Block, DayCheck, Intensity, PlannedSession, WeeklyReview } from '../plan/types'
import { applyProposals, combine } from './apply'
import { reviewDue } from './due'
import { hrvStatus, morningCheck, swapPlan } from './morning'
import { reviewRules, type RuleInput } from './rules'
import { lowDays, summariseWeek, type WeekSummary } from './summary'

// A block from Monday 2 Nov 2026: build 2 Nov, 9 Nov, 16 Nov, deload 23 Nov, then build again.
const block: Block = {
  id: 'b',
  name: 'Block',
  start: '2026-11-02',
  weeks: 8,
  buildWeeks: 3,
  progressionPct: 8,
  deloadPct: 60,
  sports: [
    { sport: 'run', sessions: 3, key: 1, easyMin: 40, long: false },
    { sport: 'bike', sessions: 3, key: 1, easyMin: 60, long: false },
  ],
  maxDays: 6,
  doubles: false,
  benchmarks: [],
  libraryMix: 0,
  createdAt: '',
  updatedAt: '',
}

let n = 0
const plan = (date: string, intensity: Intensity, extra: Partial<PlannedSession> = {}): PlannedSession => ({
  id: `p${++n}`,
  blockId: 'b',
  date,
  sport: 'run',
  intensity,
  title: intensity === 'key' ? 'Intervals' : 'Easy run',
  durationSec: 3600,
  oneOff: { name: 'x', sport: extra.sport ?? 'run', tags: [], rpe: intensity === 'key' ? 8 : 3 },
  ...extra,
})

const log = (p: PlannedSession, extra: Partial<Session> = {}): Session => ({
  id: `s-${p.id}`,
  sport: p.sport,
  date: p.date,
  planId: p.id,
  durationSec: p.durationSec,
  rpe: p.intensity === 'key' ? 8 : 3,
  status: 'completed',
  source: 'manual',
  createdAt: '',
  updatedAt: '',
  ...extra,
})

const checkin = (date: string, w: Partial<Wellbeing> = {}): Wellbeing => ({ date, updatedAt: '', ...w })

/** A normal week from 9 Nov: two key and four easy sessions, all done unless told otherwise. */
function week(start = '2026-11-09', opts: { skip?: number[]; sessions?: (p: PlannedSession, i: number) => Partial<Session> | undefined } = {}) {
  const planned = [
    plan(start, 'key'),
    plan(addDays(start, 1), 'easy', { sport: 'bike' }),
    plan(addDays(start, 2), 'easy'),
    plan(addDays(start, 3), 'key', { sport: 'bike' }),
    plan(addDays(start, 4), 'easy', { sport: 'bike' }),
    plan(addDays(start, 5), 'easy'),
  ]
  const sessions = planned.flatMap((p, i) => (opts.skip?.includes(i) ? [] : [log(p, opts.sessions?.(p, i))]))
  return { planned, sessions }
}

const summarise = (start: string, planned: PlannedSession[], sessions: Session[], wellbeing: Wellbeing[] = []) => summariseWeek({ start, planned, sessions, wellbeing, workouts: [] })

function rules(summary: WeekSummary, extra: Partial<RuleInput> = {}) {
  return reviewRules({ summary, block, weeks: blockWeeks(block, []), planned: [], injuries: [], ...extra })
}

describe('week summary', () => {
  it('sorts planned sessions into done, moved, skipped and missed', () => {
    const { planned, sessions } = week('2026-11-09', { skip: [3, 4], sessions: (_, i) => (i === 2 ? { date: '2026-11-12' } : undefined) })
    planned[4].skipped = true
    const extra = { ...log(plan('2026-11-14', 'easy')), planId: undefined, id: 'extra', durationSec: 1800 }
    const s = summarise('2026-11-09', planned, [...sessions, extra])
    expect(s.results.map((r) => r.outcome)).toEqual(['done', 'done', 'moved', 'missed', 'skipped', 'done'])
    expect(s.plannedSec).toBe(5 * 3600)
    expect(s.doneSec).toBe(4 * 3600)
    expect(s.extraSec).toBe(1800)
    expect([s.keyDue, s.keyDone, s.keyMissed.length]).toEqual([2, 1, 1])
  })

  it('judges check-ins against the athlete’s own normal once there are enough', () => {
    const before = Array.from({ length: 10 }, (_, i) => checkin(addDays('2026-10-20', i), { sleepHours: 8 + (i % 2) * 0.5, energy: 4 }))
    const days = lowDays([checkin('2026-11-09', { sleepHours: 7 }), checkin('2026-11-10', { sleepHours: 8, energy: 2 })], before)
    expect(days.baseline).toBe('own')
    // 7h is well under a usual 8–8.5h; energy 2 is under a steady 4.
    expect(days.days.map((d) => d.reasons)).toEqual([['short sleep'], ['low energy']])
    const fixed = lowDays([checkin('2026-11-09', { sleepHours: 7 }), checkin('2026-11-10', { sleepHours: 5.5, fatigue: 4 })], [])
    expect(fixed.baseline).toBe('fixed')
    expect(fixed.days.map((d) => d.date)).toEqual(['2026-11-10'])
  })
})

describe('review rules', () => {
  it('ill: next week easy only, and no other volume change on top', () => {
    const { planned, sessions } = week('2026-11-09', { skip: [0, 3, 5] })
    const s = summarise('2026-11-09', planned, sessions, [checkin('2026-11-11', { illness: true })])
    const out = rules(s)
    expect(out.find((p) => p.rule === 'ill')?.change).toEqual({ kind: 'adjustWeek', week: '2026-11-16', adjust: { easyOnly: true } })
    expect(out.some((p) => p.id === 'low-completion')).toBe(false)
  })

  it('struggling: brings the deload forward when one is still to come', () => {
    const { planned, sessions } = week('2026-11-02', { sessions: (p) => (p.intensity === 'easy' ? { rpe: 6 } : undefined) })
    const bad = ['2026-11-03', '2026-11-04', '2026-11-05'].map((d) => checkin(d, { sleepHours: 5 }))
    const out = rules(summarise('2026-11-02', planned, sessions, bad))
    expect(out.find((p) => p.rule === 'struggling')?.change).toEqual({ kind: 'weekKind', week: '2026-11-09', to: 'deload' })
  })

  it('struggling: cuts 20% when no deload is left, and changes nothing before a deload', () => {
    const { planned, sessions } = week('2026-11-02', { sessions: (p) => (p.intensity === 'easy' ? { rpe: 6 } : undefined) })
    const bad = ['2026-11-03', '2026-11-04', '2026-11-05'].map((d) => checkin(d, { sleepHours: 5 }))
    const short = { ...block, weeks: 3 }
    const cut = reviewRules({ summary: summarise('2026-11-02', planned, sessions, bad), block: short, weeks: blockWeeks(short, []), planned: [], injuries: [] })
    expect(cut.find((p) => p.rule === 'struggling')?.change).toEqual({ kind: 'adjustWeek', week: '2026-11-09', adjust: { scale: 80 } })

    const w3 = week('2026-11-16', { sessions: (p) => (p.intensity === 'easy' ? { rpe: 6 } : undefined) })
    const bad3 = ['2026-11-17', '2026-11-18', '2026-11-19'].map((d) => checkin(d, { sleepHours: 5 }))
    const before = rules(summarise('2026-11-16', w3.planned, w3.sessions, bad3)).find((p) => p.rule === 'struggling')
    expect(before?.change).toBeUndefined()
    expect(before?.title).toBe('Next week is already lighter')
  })

  it('low completion: next week holds this week’s volume; two weeks running suggests re-running the coach', () => {
    const w1 = week('2026-11-02', { skip: [1, 2, 4, 5] })
    const w2 = week('2026-11-09', { skip: [1, 2, 4, 5] })
    const prev = summarise('2026-11-02', w1.planned, w1.sessions)
    const out = rules(summarise('2026-11-09', w2.planned, w2.sessions), { previous: prev })
    // Week 2 is at 108%, week 3 at 116%: hold at 108 / 116.
    expect(out.find((p) => p.id === 'low-completion')?.change).toEqual({ kind: 'adjustWeek', week: '2026-11-16', adjust: { scale: 93 } })
    expect(out.find((p) => p.id === 'low-twice')?.link?.to).toBe('/plan/coach/plan')
  })

  it('a missed benchmark moves to the next build week’s key session; other missed ones are not made up', () => {
    const w = week('2026-11-09', { skip: [0, 3] })
    w.planned[0].benchmark = true
    const later = [plan('2026-11-17', 'key'), plan('2026-11-24', 'key'), plan('2026-12-01', 'key')]
    const out = rules(summarise('2026-11-09', w.planned, w.sessions), { planned: [...w.planned, ...later] })
    expect(out.find((p) => p.rule === 'missed-key' && p.change)?.change).toEqual({ kind: 'moveSession', fromId: w.planned[0].id, toId: later[0].id })
    expect(out.find((p) => p.id === 'missed-key')?.change).toBeUndefined()
  })

  it('a missed benchmark skips a week another proposal makes easy, and days already gone', () => {
    const w = week('2026-11-09', { skip: [0] })
    w.planned[0].benchmark = true
    const later = [plan('2026-11-17', 'key'), plan('2026-11-19', 'key'), plan('2026-12-01', 'key')]
    const s = summarise('2026-11-09', w.planned, w.sessions, [checkin('2026-11-12', { illness: true })])
    const ill = rules(s, { planned: [...w.planned, ...later] })
    // Next week is easy only, and the 23rd is the deload: the 1 Dec build week it is.
    expect(ill.find((p) => p.id.startsWith('move-'))?.change).toMatchObject({ toId: later[2].id })
    const late = rules(summarise('2026-11-09', w.planned, w.sessions), { planned: [...w.planned, ...later], today: '2026-11-17' })
    expect(late.find((p) => p.id.startsWith('move-'))?.change).toMatchObject({ toId: later[1].id })
  })

  it('niggle: pain not settled by morning means less of that sport; a warning sign (as the screening sets them) leaves it out until cleared', () => {
    const { planned, sessions } = week()
    const s = summarise('2026-11-09', planned, sessions)
    const knee: Injury = { id: 'k', area: 'knee', status: 'current', painInSport: 4, aggravatedBy: ['running'], seenBy: 'physio', updatedAt: '' }
    const less = rules(s, { niggle: { injury: knee, settled: false }, injuries: [knee] })
    expect(less.find((p) => p.rule === 'niggle')?.change).toEqual({ kind: 'adjustWeek', week: '2026-11-16', adjust: { less: ['run'] } })
    expect(rules(s, { niggle: { injury: knee, settled: true }, injuries: [knee] }).some((p) => p.rule === 'niggle')).toBe(false)

    // Over 5/10 in training is a warning sign in the screening: see a physio first.
    for (const red of [{ ...knee, painInSport: 6 }, { ...knee, painAtRest: true }]) {
      const out = rules(s, { niggle: { injury: red, settled: true }, injuries: [red] })
      expect(out.filter((p) => p.rule === 'niggle').map((p) => p.change)).toEqual([{ kind: 'adjustWeek', week: '2026-11-16', adjust: { drop: ['run'] } }])
    }
    // No answer this week: the flag still keeps running out.
    expect(rules(s, { injuries: [{ ...knee, painAtRest: true }] }).find((p) => p.rule === 'niggle')?.title).toMatch(/^No running next week/)
  })

  const reps = (status: 'over' | 'under' | 'hit'): Piece[] =>
    Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, distanceM: 1000, durationSec: status === 'over' ? 220 : status === 'under' ? 260 : 240, target: { metric: 'pace', min: 235, max: 245 } }))

  it('targets too easy: suggests a re-test, not more volume', () => {
    const { planned, sessions } = week('2026-11-09', { sessions: (p) => (p.intensity === 'key' && p.sport === 'run' ? { pieces: reps('over'), rpe: 6 } : undefined) })
    const out = rules(summarise('2026-11-09', planned, sessions))
    expect(out.find((p) => p.rule === 'targets-easy')).toMatchObject({ title: 'Re-test your run threshold pace', link: { to: '/log/markers' } })
  })

  it('targets too hard: two key sessions in a row mostly missed', () => {
    const missed = (p: PlannedSession) => (p.intensity === 'key' && p.sport === 'run' ? { pieces: reps('under') } : undefined)
    const w1 = week('2026-11-02', { sessions: missed })
    const w2 = week('2026-11-09', { sessions: missed })
    const out = rules(summarise('2026-11-09', w2.planned, w2.sessions), { previous: summarise('2026-11-02', w1.planned, w1.sessions) })
    expect(out.find((p) => p.rule === 'targets-hard')?.title).toBe('Check your run threshold pace')
    expect(rules(summarise('2026-11-09', w2.planned, w2.sessions)).some((p) => p.rule === 'targets-hard')).toBe(false)
  })

  it('a big work week lightens training, unless the planner already does', () => {
    const { planned, sessions } = week()
    const s = summarise('2026-11-09', planned, sessions)
    expect(rules(s, { work: { next: 40, recent: [30, 30, 32, 0] } }).find((p) => p.rule === 'work')?.change).toEqual({ kind: 'adjustWeek', week: '2026-11-16', adjust: { scale: 90 } })
    expect(rules(s, { work: { next: 50, recent: [30, 30] } }).find((p) => p.rule === 'work')?.change).toBeUndefined()
    expect(rules(s, { work: { next: 33, recent: [30, 30] } }).some((p) => p.rule === 'work')).toBe(false)
  })

  it('a good week proposes nothing', () => {
    const { planned, sessions } = week()
    expect(rules(summarise('2026-11-09', planned, sessions), { work: { next: 30, recent: [30, 30] } })).toEqual([])
  })
})

describe('applying a review', () => {
  it('combines changes to one week and moves sessions', () => {
    expect(combine({ scale: 90, less: ['run'] }, { scale: 80, drop: ['bike'], easyOnly: true })).toEqual({ scale: 80, easyOnly: true, less: ['run'], drop: ['bike'] })
    const from = plan('2026-11-09', 'key', { benchmark: true, title: 'Brick' })
    const to = plan('2026-11-17', 'key')
    const r = applyProposals(
      [
        { id: 'a', rule: 'ill', title: '', reason: '', findings: [], change: { kind: 'adjustWeek', week: '2026-11-16', adjust: { easyOnly: true } } },
        { id: 'b', rule: 'struggling', title: '', reason: '', findings: [], change: { kind: 'weekKind', week: '2026-11-16', to: 'deload' } },
        { id: 'c', rule: 'missed-key', title: '', reason: '', findings: [], change: { kind: 'moveSession', fromId: from.id, toId: to.id } },
      ],
      block,
      [from, to],
    )
    expect(r.block?.weekAdjust).toEqual({ '2026-11-16': { easyOnly: true } })
    expect(r.block?.weekKinds).toEqual({ '2026-11-16': 'deload' })
    expect(r.sessions[0]).toMatchObject({ id: to.id, date: '2026-11-17', title: 'Brick', benchmark: true, locked: true })
  })

  it('the planner honours a week’s changes', () => {
    const planned = (b: Block) => planBlock({ block: b, events: [], commitments: [], prefs: DEFAULT_PREFS, workouts: [], fixed: [], from: b.start }).planned.filter((p) => p.date >= '2026-11-16' && p.date <= '2026-11-22')
    const easy = planned({ ...block, weekAdjust: { '2026-11-16': { easyOnly: true } } })
    expect(easy.length).toBeGreaterThan(0)
    expect(easy.some((p) => p.intensity === 'key')).toBe(false)
    const noRun = planned({ ...block, weekAdjust: { '2026-11-16': { drop: ['run'] } } })
    expect(noRun.some((p) => p.sport === 'run')).toBe(false)
    const less = planned({ ...block, weekAdjust: { '2026-11-16': { less: ['run'] } } }).filter((p) => p.sport === 'run')
    expect(less.length).toBe(2)
    expect(less.some((p) => p.intensity === 'key')).toBe(false)
    const weeks = blockWeeks({ ...block, weekAdjust: { '2026-11-16': { scale: 80 } } }, [])
    expect(weeks[2].volume).toBeCloseTo(1.16 * 0.8)
    expect(weeks[2].notes.at(-1)).toBe('After your review: volume 80%')
  })
})

describe('morning check', () => {
  const today = '2026-11-18'
  const key = plan(today, 'key')

  it('offers a swap after a short night, and asks only once', () => {
    const input = { today, planned: [key], sessions: [], wellbeing: [checkin(today, { sleepHours: 5.5 })], dayChecks: [] as DayCheck[] }
    expect(morningCheck(input)).toMatchObject({ session: key, reasons: ['5.5h sleep'], findings: ['sleep'] })
    expect(morningCheck({ ...input, dayChecks: [{ date: today, choice: 'kept', reasons: [], updatedAt: '' }] })).toBeUndefined()
    expect(morningCheck({ ...input, wellbeing: [checkin(today, { sleepHours: 7.5 })] })).toBeUndefined()
    expect(morningCheck({ ...input, wellbeing: [] })).toBeUndefined()
  })

  it('reads HRV against its normal range: the 7-day average vs the 28 days before, mean ± half an SD', () => {
    const base = Array.from({ length: 28 }, (_, i) => checkin(addDays(today, -34 + i), { hrv: 70 + (i % 3) * 5 }))
    const low = [0, 1, 2, 3].map((i) => checkin(addDays(today, -i), { hrv: 62 }))
    const s = hrvStatus([...base, ...low], today)!
    expect(s.below).toBe(true)
    expect(Math.round(s.week)).toBe(62)
    expect(hrvStatus(low, today)).toBeUndefined()
    const check = morningCheck({ today, planned: [key], sessions: [], wellbeing: [...base, ...low.map((w) => (w.date === today ? { ...w, sleepHours: 8 } : w))], dayChecks: [] })
    expect(check?.findings).toEqual(['hrv-guided'])
  })

  it('swaps for an easy session and moves the hard one to a free day later in the week', () => {
    const others = [plan('2026-11-19', 'easy', { sport: 'bike' }), plan('2026-11-20', 'key', { sport: 'bike' }), plan('2026-11-21', 'easy', { sport: 'bike' })]
    const swap = swapPlan({ today, session: key, planned: [key, ...others], events: [], block, weekStartsOn: 1 })
    expect(swap.easy).toMatchObject({ id: key.id, date: today, intensity: 'easy', locked: true })
    // Thursday is next to Friday's key session, Friday has one, Saturday is next to it: Sunday it is.
    expect(swap.moved).toMatchObject({ date: '2026-11-22', intensity: 'key', locked: true })
    const full = swapPlan({ today: '2026-11-21', session: { ...key, date: '2026-11-21' }, planned: [plan('2026-11-22', 'key')], events: [], block, weekStartsOn: 1 })
    expect(full.moved).toBeUndefined()
  })
})

describe('review due', () => {
  const planned = [plan('2026-11-17', 'easy'), plan('2026-11-24', 'easy')]
  const review = (weekStart: string): WeeklyReview => ({ id: weekStart, weekStart, status: 'done', proposals: [], accepted: [], createdAt: '', updatedAt: '' })

  it('is last week until the evening of this week’s last day', () => {
    expect(reviewDue(new Date('2026-11-25T10:00'), '2026-11-25', 1, planned, [])).toBe('2026-11-16')
    expect(reviewDue(new Date('2026-11-29T18:00'), '2026-11-29', 1, planned, [])).toBe('2026-11-23')
    expect(reviewDue(new Date('2026-11-25T10:00'), '2026-11-25', 1, planned, [review('2026-11-16')])).toBeUndefined()
    expect(reviewDue(new Date('2026-12-09T10:00'), '2026-12-09', 1, planned, [])).toBeUndefined()
  })
})
