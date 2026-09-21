import { describe, expect, it } from 'vitest'
import { DailyIntakeCreateSchema, DailyIntakeUpdateSchema } from '@/schemas/dailyIntake'

const now = new Date().toISOString()

function intake(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    date: '2026-09-10',
    supplementId: 'supp-1',
    planId: 'plan-1',
    timeSlot: 'morning',
    amount: 2,
    taken: true,
    isExtra: false,
    origin: 'checkin',
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('DailyIntakeCreateSchema', () => {
  it('计划打卡合法', () => {
    expect(DailyIntakeCreateSchema.safeParse(intake()).success).toBe(true)
  })

  it('追加一次：origin=extra 且 isExtra=true 合法', () => {
    expect(
      DailyIntakeCreateSchema.safeParse(intake({ origin: 'extra', isExtra: true })).success,
    ).toBe(true)
  })

  it('isExtra 与 origin 不一致被拒', () => {
    expect(
      DailyIntakeCreateSchema.safeParse(intake({ origin: 'extra', isExtra: false })).success,
    ).toBe(false)
    expect(
      DailyIntakeCreateSchema.safeParse(intake({ origin: 'checkin', isExtra: true })).success,
    ).toBe(false)
  })

  it('服用量至少为 1 且必须是整数', () => {
    expect(DailyIntakeCreateSchema.safeParse(intake({ amount: 0 })).success).toBe(false)
    expect(DailyIntakeCreateSchema.safeParse(intake({ amount: 1.5 })).success).toBe(false)
  })

  it('今天不能标漏服：taken=false 且 origin=checkin 被拒', () => {
    const result = DailyIntakeCreateSchema.safeParse(intake({ taken: false }))
    expect(result.success).toBe(false)
    expect(result.success === false && JSON.stringify(result.error.issues)).toContain(
      '只有补录或手动录入的记录才能标记漏服',
    )
  })

  it('补录标漏服合法（不扣余量由 service 负责）', () => {
    const record = { ...intake({ taken: false }), origin: 'backfill', isExtra: true }
    expect(DailyIntakeCreateSchema.safeParse(record).success).toBe(true)
  })

  it('手动录入标漏服合法', () => {
    const record = { ...intake({ taken: false }), origin: 'manual', isExtra: true, planId: null }
    expect(DailyIntakeCreateSchema.safeParse(record).success).toBe(true)
  })
})

describe('DailyIntakeUpdateSchema', () => {
  it('只改备注不触发 refine 误报', () => {
    expect(DailyIntakeUpdateSchema.safeParse({ notes: '改个备注' }).success).toBe(true)
  })

  it('只改数量合法', () => {
    expect(DailyIntakeUpdateSchema.safeParse({ amount: 1 }).success).toBe(true)
  })

  it('同时给 taken=false 与 origin=checkin 被拒', () => {
    expect(DailyIntakeUpdateSchema.safeParse({ taken: false, origin: 'checkin' }).success).toBe(
      false,
    )
  })

  it('只给 taken=false 时放行（交给 service 用合并后的完整对象校验）', () => {
    expect(DailyIntakeUpdateSchema.safeParse({ taken: false }).success).toBe(true)
  })
})
