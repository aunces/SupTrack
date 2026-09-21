import { describe, expect, it } from 'vitest'
import { PausePeriodCreateSchema, PausePeriodUpdateSchema } from '@/schemas/pausePeriod'

const now = new Date().toISOString()

function period(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    schemeId: null,
    supplementId: 'supp-1',
    startDate: '2026-09-19',
    endDate: '2026-09-21',
    reason: '胃不舒服',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('PausePeriodCreateSchema', () => {
  it('临时停药：schemeId 空 + 有开始日期，合法', () => {
    expect(PausePeriodCreateSchema.safeParse(period()).success).toBe(true)
  })

  it('临时停药必须填开始日期，否则被拒', () => {
    const result = PausePeriodCreateSchema.safeParse(period({ startDate: null }))
    expect(result.success).toBe(false)
    expect(result.success === false && JSON.stringify(result.error.issues)).toContain(
      '临时停药必须填写开始日期',
    )
  })

  it('方案组条目：schemeId 非空时可跟随方案组（开始日期留空）', () => {
    expect(
      PausePeriodCreateSchema.safeParse(period({ schemeId: 'scheme-1', startDate: null })).success,
    ).toBe(true)
  })

  it('结束日期早于开始日期被拒', () => {
    const result = PausePeriodCreateSchema.safeParse(period({ endDate: '2026-09-18' }))
    expect(result.success).toBe(false)
    expect(result.success === false && JSON.stringify(result.error.issues)).toContain(
      '结束日期不能早于开始日期',
    )
  })

  it("'ALL' 表示全部补剂，合法", () => {
    expect(PausePeriodCreateSchema.safeParse(period({ supplementId: 'ALL' })).success).toBe(true)
  })

  it('补充剂为空被拒', () => {
    expect(PausePeriodCreateSchema.safeParse(period({ supplementId: '' })).success).toBe(false)
  })

  it('结束日期留空 = 持续中，合法', () => {
    expect(PausePeriodCreateSchema.safeParse(period({ endDate: null })).success).toBe(true)
  })
})

describe('PausePeriodUpdateSchema', () => {
  it('只改原因不触发开始日期校验', () => {
    expect(PausePeriodUpdateSchema.safeParse({ reason: '改个原因' }).success).toBe(true)
  })

  it('把 schemeId 置空并同时给开始日期，合法', () => {
    expect(
      PausePeriodUpdateSchema.safeParse({ schemeId: null, startDate: '2026-09-19' }).success,
    ).toBe(true)
  })

  it('把 schemeId 置空却不给开始日期，被拒', () => {
    expect(PausePeriodUpdateSchema.safeParse({ schemeId: null }).success).toBe(false)
  })

  it('同时给开始与结束且顺序颠倒，被拒', () => {
    expect(
      PausePeriodUpdateSchema.safeParse({ startDate: '2026-09-21', endDate: '2026-09-19' }).success,
    ).toBe(false)
  })
})
