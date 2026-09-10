import { describe, expect, it } from 'vitest'
import { NOT_DELETED } from '@/constants/deletedAt'
import type { DailyIntake, DosagePlan, PausePeriod, TimeSlot } from '@/types'
import { computeDayStat } from '@/utils/completion'

function plan(
  supplementId: string,
  timeSlots: TimeSlot[],
  createdAt = '2020-01-01T00:00:00.000Z',
): DosagePlan {
  return {
    id: `plan-${supplementId}-${timeSlots.join('-')}`,
    supplementId,
    dailyAmount: 2,
    timeSlots,
    withMeal: true,
    isActive: true,
    notes: null,
    deletedAt: NOT_DELETED,
    createdAt,
    updatedAt: createdAt,
  }
}

function intake(
  supplementId: string,
  timeSlot: TimeSlot,
  status: DailyIntake['status'],
  overrides: Partial<DailyIntake> = {},
): DailyIntake {
  return {
    id: `intake-${supplementId}-${timeSlot}-${status}`,
    date: '2026-09-10',
    supplementId,
    planId: null,
    plannedAmount: null,
    plannedAmountSnapshot: null,
    plannedAmountSource: 'unavailable',
    actualAmount: 1,
    timeSlot,
    status,
    source: 'manual',
    notes: null,
    stockState: 'not_deducted',
    deletedAt: NOT_DELETED,
    createdAt: '2026-09-10T08:00:00.000Z',
    updatedAt: '2026-09-10T08:00:00.000Z',
    ...overrides,
  }
}

function pause(supplementId: string | null): PausePeriod {
  return {
    id: `pause-${supplementId ?? 'global'}`,
    supplementId,
    startDate: '2026-09-01',
    endDate: null,
    reason: null,
    cycleMode: 'none',
    cycleStartDate: null,
    cycleOnDays: null,
    cycleOffDays: null,
    deletedAt: NOT_DELETED,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }
}

describe('日历完成度', () => {
  it('按 timeSlots 展开应服计划项', () => {
    const stat = computeDayStat({
      date: '2026-09-10',
      plans: [plan('s1', ['morning', 'evening'])],
      intakes: [
        intake('s1', 'morning', 'taken', {
          source: 'plan',
          plannedAmountSource: 'plan_snapshot',
        }),
      ],
      periods: [],
    })
    expect(stat.planned).toBe(2)
    expect(stat.taken).toBe(1)
    expect(stat.completion).toBe(0.5)
  })

  it('无计划时分母为 0，completion 为 null', () => {
    const stat = computeDayStat({
      date: '2026-09-10',
      plans: [],
      intakes: [],
      periods: [],
    })
    expect(stat.completion).toBeNull()
  })

  it('停药日的计划不计入应服项', () => {
    const stat = computeDayStat({
      date: '2026-09-10',
      plans: [plan('s1', ['morning']), plan('s2', ['morning'])],
      intakes: [],
      periods: [pause('s1')],
    })
    expect(stat.planned).toBe(1)
    expect(stat.paused).toBe(true)
  })

  it('漏服计入分母但不计入分子，多服单独统计', () => {
    const stat = computeDayStat({
      date: '2026-09-10',
      plans: [plan('s1', ['morning']), plan('s2', ['morning'])],
      intakes: [intake('s1', 'morning', 'skipped'), intake('s2', 'evening', 'extra')],
      periods: [],
    })
    expect(stat.planned).toBe(2)
    expect(stat.taken).toBe(0)
    expect(stat.skipped).toBe(1)
    expect(stat.extra).toBe(1)
    expect(stat.completion).toBe(0)
  })

  it('完成度上限为 1', () => {
    const stat = computeDayStat({
      date: '2026-09-10',
      plans: [plan('s1', ['morning'])],
      intakes: [
        intake('s1', 'morning', 'taken', { source: 'plan', plannedAmountSource: 'plan_snapshot' }),
        intake('s1', 'noon', 'taken', { source: 'plan', plannedAmountSource: 'plan_snapshot' }),
      ],
      periods: [],
    })
    expect(stat.completion).toBe(1)
  })

  it('【回归】时段不匹配计划的手动录入不计入完成度', () => {
    // 场景：三个计划都在 noon，只有一条 morning 的手动录入 → 完成度必须为 0
    const stat = computeDayStat({
      date: '2026-09-10',
      plans: [plan('s1', ['noon']), plan('s2', ['noon']), plan('s3', ['noon'])],
      intakes: [intake('s1', 'morning', 'taken')],
      periods: [],
    })
    expect(stat.planned).toBe(3)
    expect(stat.taken).toBe(0)
    expect(stat.completion).toBe(0)
  })

  it('命中计划项的今日手动录入仍不计入完成度', () => {
    const stat = computeDayStat({
      date: '2026-09-10',
      plans: [plan('s1', ['noon'])],
      intakes: [intake('s1', 'noon', 'taken', { source: 'manual' })],
      periods: [],
    })
    expect(stat.taken).toBe(0)
  })

  it('打卡（source=plan）与补录已服用（current_plan）均计入完成度', () => {
    const stat = computeDayStat({
      date: '2026-09-10',
      plans: [plan('s1', ['noon']), plan('s2', ['noon'])],
      intakes: [
        intake('s1', 'noon', 'taken', {
          source: 'plan',
          plannedAmountSource: 'plan_snapshot',
        }),
        intake('s2', 'noon', 'partial', {
          source: 'manual',
          plannedAmountSource: 'current_plan',
        }),
      ],
      periods: [],
    })
    expect(stat.taken).toBe(2)
    expect(stat.completion).toBe(1)
  })

  it('计划项去重：同一补剂同一时段只计一项', () => {
    const stat = computeDayStat({
      date: '2026-09-10',
      plans: [plan('s1', ['noon']), plan('s1', ['noon'], '2026-08-01T00:00:00.000Z')],
      intakes: [
        intake('s1', 'noon', 'taken', { source: 'plan', plannedAmountSource: 'plan_snapshot' }),
      ],
      periods: [],
    })
    expect(stat.planned).toBe(1)
    expect(stat.completion).toBe(1)
  })
})
