import { describe, expect, it } from 'vitest'
import { NOT_DELETED } from '@/constants/deletedAt'
import type { PausePeriod } from '@/types'
import { isPaused, isPausedOnDate } from '@/utils/pause'

function period(overrides: Partial<PausePeriod> = {}): PausePeriod {
  return {
    id: 'p1',
    supplementId: 's1',
    startDate: '2026-09-01',
    endDate: '2026-09-05',
    reason: null,
    cycleMode: 'none',
    cycleStartDate: null,
    cycleOnDays: null,
    cycleOffDays: null,
    deletedAt: NOT_DELETED,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('isPausedOnDate', () => {
  it('一次性停药期：区间内为停药', () => {
    const p = period()
    expect(isPausedOnDate(p, '2026-09-01')).toBe(true)
    expect(isPausedOnDate(p, '2026-09-05')).toBe(true)
    expect(isPausedOnDate(p, '2026-08-31')).toBe(false)
    expect(isPausedOnDate(p, '2026-09-06')).toBe(false)
  })

  it('endDate 为空表示持续到之后所有日期', () => {
    const p = period({ endDate: null })
    expect(isPausedOnDate(p, '2026-12-31')).toBe(true)
  })

  it('周期模式：吃 3 停 2，锚点当天算第 1 天', () => {
    const p = period({
      startDate: '2026-09-01',
      endDate: null,
      cycleMode: 'cyclic',
      cycleStartDate: '2026-09-01',
      cycleOnDays: 3,
      cycleOffDays: 2,
    })
    expect(isPausedOnDate(p, '2026-09-01')).toBe(false)
    expect(isPausedOnDate(p, '2026-09-03')).toBe(false)
    expect(isPausedOnDate(p, '2026-09-04')).toBe(true)
    expect(isPausedOnDate(p, '2026-09-05')).toBe(true)
    expect(isPausedOnDate(p, '2026-09-06')).toBe(false)
    expect(isPausedOnDate(p, '2026-09-09')).toBe(true)
  })

  it('周期锚点之前的日期不参与周期计算', () => {
    const p = period({
      startDate: '2026-08-01',
      endDate: null,
      cycleMode: 'cyclic',
      cycleStartDate: '2026-09-01',
      cycleOnDays: 3,
      cycleOffDays: 2,
    })
    expect(isPausedOnDate(p, '2026-08-15')).toBe(false)
  })
})

describe('isPaused', () => {
  it('补剂级与全局为并集', () => {
    const periods = [
      period({ id: 'a', supplementId: 's1', startDate: '2026-09-10', endDate: '2026-09-12' }),
      period({ id: 'b', supplementId: null, startDate: '2026-09-01', endDate: '2026-09-30' }),
    ]
    const result = isPaused('s1', '2026-09-11', periods)
    expect(result.paused).toBe(true)
    expect(result.reasons.map((r) => r.id).sort()).toEqual(['a', 'b'])
  })

  it('软删除的停药期不参与计算', () => {
    const periods = [period({ deletedAt: '2026-09-02T00:00:00.000Z' })]
    expect(isPaused('s1', '2026-09-03', periods).paused).toBe(false)
  })

  it('其它补剂的停药期不影响本补剂', () => {
    const periods = [period({ supplementId: 's2' })]
    expect(isPaused('s1', '2026-09-03', periods).paused).toBe(false)
  })
})
