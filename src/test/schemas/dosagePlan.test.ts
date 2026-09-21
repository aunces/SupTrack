import { describe, expect, it } from 'vitest'
import { DosagePlanCreateSchema, DosagePlanUpdateSchema } from '@/schemas/dosagePlan'

const now = new Date().toISOString()

const base = {
  id: crypto.randomUUID(),
  supplementId: 'supp-1',
  amountPerTime: 1,
  timeSlots: ['morning'],
  rateMode: 'daily',
  rateOnDays: null,
  rateOffDays: null,
  rateAnchorDate: null,
  isActive: true,
  notes: null,
  createdAt: now,
  updatedAt: now,
}

describe('DosagePlanCreateSchema', () => {
  it('daily 模式三个节奏参数留空合法', () => {
    expect(DosagePlanCreateSchema.safeParse(base).success).toBe(true)
  })

  it('cyclic 模式补齐 吃 / 停 / 起点 合法', () => {
    const plan = {
      ...base,
      rateMode: 'cyclic',
      rateOnDays: 1,
      rateOffDays: 1,
      rateAnchorDate: '2026-09-20',
    }
    expect(DosagePlanCreateSchema.safeParse(plan).success).toBe(true)
  })

  it('daily 模式填了节奏参数也宽容通过（不报错）', () => {
    const plan = { ...base, rateOnDays: 5, rateOffDays: 2, rateAnchorDate: '2026-09-20' }
    expect(DosagePlanCreateSchema.safeParse(plan).success).toBe(true)
  })

  it('cyclic 缺起点被拒', () => {
    const plan = { ...base, rateMode: 'cyclic', rateOnDays: 1, rateOffDays: 1 }
    const result = DosagePlanCreateSchema.safeParse(plan)
    expect(result.success).toBe(false)
    expect(result.success === false && JSON.stringify(result.error.issues)).toContain(
      '节奏参数不完整',
    )
  })

  it('cyclic 的停用天数为 0 被拒', () => {
    const plan = {
      ...base,
      rateMode: 'cyclic',
      rateOnDays: 1,
      rateOffDays: 0,
      rateAnchorDate: '2026-09-20',
    }
    expect(DosagePlanCreateSchema.safeParse(plan).success).toBe(false)
  })

  it('时段为空被拒', () => {
    const result = DosagePlanCreateSchema.safeParse({ ...base, timeSlots: [] })
    expect(result.success).toBe(false)
    expect(result.success === false && JSON.stringify(result.error.issues)).toContain(
      '请至少选择一个服用时段',
    )
  })

  it('时段重复被拒', () => {
    expect(
      DosagePlanCreateSchema.safeParse({ ...base, timeSlots: ['morning', 'morning'] }).success,
    ).toBe(false)
  })

  it('每次服用量为 0 被拒', () => {
    expect(DosagePlanCreateSchema.safeParse({ ...base, amountPerTime: 0 }).success).toBe(false)
  })
})

describe('DosagePlanUpdateSchema', () => {
  it('只改备注不触发节奏校验', () => {
    expect(DosagePlanUpdateSchema.safeParse({ notes: '随餐' }).success).toBe(true)
  })

  it('把 rateMode 改成 cyclic 却没补参数被拒', () => {
    expect(DosagePlanUpdateSchema.safeParse({ rateMode: 'cyclic' }).success).toBe(false)
  })

  it('把 rateMode 改成 cyclic 并补齐参数合法', () => {
    const patch = {
      rateMode: 'cyclic',
      rateOnDays: 5,
      rateOffDays: 2,
      rateAnchorDate: '2026-09-20',
    }
    expect(DosagePlanUpdateSchema.safeParse(patch).success).toBe(true)
  })
})
