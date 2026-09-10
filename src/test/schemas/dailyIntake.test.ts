import { describe, expect, it } from 'vitest'
import { DailyIntakeCreateSchema, DailyIntakeUpdateSchema } from '@/schemas/dailyIntake'

const now = new Date().toISOString()
const deletedAt = new Date().toISOString()

function intake(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    date: '2026-09-10',
    supplementId: 'supp-1',
    planId: 'plan-1',
    plannedAmount: null,
    plannedAmountSnapshot: 2,
    plannedAmountSource: 'plan_snapshot',
    actualAmount: 2,
    timeSlot: 'morning',
    status: 'taken',
    source: 'plan',
    notes: null,
    stockState: 'deducted',
    deletedAt: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('DailyIntakeCreateSchema', () => {
  it('未删除 + deducted 合法', () => {
    expect(DailyIntakeCreateSchema.safeParse(intake()).success).toBe(true)
  })

  it('未删除 + not_deducted 合法', () => {
    expect(DailyIntakeCreateSchema.safeParse(intake({ stockState: 'not_deducted' })).success).toBe(
      true,
    )
  })

  it('【C-1】软删除 + not_deducted 合法', () => {
    expect(
      DailyIntakeCreateSchema.safeParse(intake({ deletedAt, stockState: 'not_deducted' })).success,
    ).toBe(true)
  })

  it('【C-1】软删除 + was_deducted 合法', () => {
    expect(
      DailyIntakeCreateSchema.safeParse(intake({ deletedAt, stockState: 'was_deducted' })).success,
    ).toBe(true)
  })

  it('软删除 + unknown 合法', () => {
    expect(
      DailyIntakeCreateSchema.safeParse(intake({ deletedAt, stockState: 'unknown' })).success,
    ).toBe(true)
  })

  it('【C-1】软删除 + deducted 非法', () => {
    expect(
      DailyIntakeCreateSchema.safeParse(intake({ deletedAt, stockState: 'deducted' })).success,
    ).toBe(false)
  })

  it('未删除 + was_deducted / unknown 非法', () => {
    expect(DailyIntakeCreateSchema.safeParse(intake({ stockState: 'was_deducted' })).success).toBe(
      false,
    )
    expect(DailyIntakeCreateSchema.safeParse(intake({ stockState: 'unknown' })).success).toBe(false)
  })

  it('skipped 不能标记已扣库存', () => {
    expect(
      DailyIntakeCreateSchema.safeParse(intake({ status: 'skipped', stockState: 'deducted' }))
        .success,
    ).toBe(false)
    expect(
      DailyIntakeCreateSchema.safeParse(intake({ status: 'skipped', stockState: 'was_deducted' }))
        .success,
    ).toBe(false)
    expect(
      DailyIntakeCreateSchema.safeParse(intake({ status: 'skipped', stockState: 'not_deducted' }))
        .success,
    ).toBe(true)
  })

  it('source=plan 不允许 status=extra', () => {
    expect(
      DailyIntakeCreateSchema.safeParse(intake({ source: 'plan', status: 'extra' })).success,
    ).toBe(false)
  })

  it('数量字段必须是整数', () => {
    expect(DailyIntakeCreateSchema.safeParse(intake({ actualAmount: 1.5 })).success).toBe(false)
    expect(DailyIntakeCreateSchema.safeParse(intake({ plannedAmountSnapshot: 2.5 })).success).toBe(
      false,
    )
  })

  it('deletedAt 不允许 null', () => {
    expect(DailyIntakeCreateSchema.safeParse(intake({ deletedAt: null })).success).toBe(false)
  })
})

describe('DailyIntakeUpdateSchema', () => {
  it('【C-5】只改 notes 不触发 refine 误报', () => {
    expect(DailyIntakeUpdateSchema.safeParse({ notes: '改个备注', updatedAt: now }).success).toBe(
      true,
    )
  })

  it('【C-5】改 status 但不改 stockState 时一致性校验跳过', () => {
    expect(DailyIntakeUpdateSchema.safeParse({ status: 'taken' }).success).toBe(true)
  })

  it('【C-5】只改 stockState 但不改 deletedAt 时一致性校验跳过', () => {
    expect(DailyIntakeUpdateSchema.safeParse({ stockState: 'deducted' }).success).toBe(true)
  })

  it('同时提供 status=skipped 与 stockState=deducted 被拒', () => {
    expect(
      DailyIntakeUpdateSchema.safeParse({ status: 'skipped', stockState: 'deducted' }).success,
    ).toBe(false)
  })

  it('同时提供 deletedAt 与非法 stockState 被拒', () => {
    expect(DailyIntakeUpdateSchema.safeParse({ deletedAt, stockState: 'deducted' }).success).toBe(
      false,
    )
  })
})
