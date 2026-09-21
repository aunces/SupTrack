import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { hasActivePlan, savePlanForSupplement } from '@/services/planService'
import { resetDb, seedSupplement } from '../helpers/db'

beforeEach(async () => {
  await resetDb()
})

function rateInput(overrides: Record<string, unknown> = {}) {
  return {
    amountPerTime: 1,
    timeSlots: ['morning'] as const,
    rateMode: 'daily' as const,
    rateOnDays: null,
    rateOffDays: null,
    rateAnchorDate: null,
    ...overrides,
  }
}

describe('savePlanForSupplement', () => {
  it('首次保存新建一条计划', async () => {
    const supplement = await seedSupplement()
    const plan = await savePlanForSupplement(supplement.id, rateInput())

    expect(plan.supplementId).toBe(supplement.id)
    expect(plan.isActive).toBe(true)
    expect(await db.dosagePlans.count()).toBe(1)
  })

  it('同补剂连续保存两次计划 → 只有一条启用计划（DIFF-02）', async () => {
    const supplement = await seedSupplement()

    await savePlanForSupplement(supplement.id, rateInput({ amountPerTime: 1 }))
    await savePlanForSupplement(supplement.id, rateInput({ amountPerTime: 2, timeSlots: ['noon'] }))

    const plans = await db.dosagePlans.toArray()
    expect(plans).toHaveLength(1)
    expect(plans.filter((p) => p.isActive)).toHaveLength(1)
    expect(plans[0].amountPerTime).toBe(2)
    expect(plans[0].timeSlots).toEqual(['noon'])
  })

  it('把计划关闭后再次保存：仍是同一条，且能重新启用', async () => {
    const supplement = await seedSupplement()
    const first = await savePlanForSupplement(supplement.id, rateInput({ isActive: false }))
    expect(first.isActive).toBe(false)

    const second = await savePlanForSupplement(supplement.id, rateInput({ isActive: true }))
    expect(second.id).toBe(first.id)
    expect(second.isActive).toBe(true)
    expect(await db.dosagePlans.count()).toBe(1)
  })

  it('时段为空 → 抛「请至少选择一个服用时段」', async () => {
    const supplement = await seedSupplement()
    await expect(
      savePlanForSupplement(supplement.id, rateInput({ timeSlots: [] })),
    ).rejects.toThrow(/请至少选择一个服用时段/)
    expect(await db.dosagePlans.count()).toBe(0)
  })

  it('cyclic 参数缺失 → 抛「节奏参数不完整」', async () => {
    const supplement = await seedSupplement()
    await expect(
      savePlanForSupplement(supplement.id, rateInput({ rateMode: 'cyclic' })),
    ).rejects.toThrow(/节奏参数不完整/)
    expect(await db.dosagePlans.count()).toBe(0)
  })

  it('cyclic 参数齐全可保存', async () => {
    const supplement = await seedSupplement()
    const plan = await savePlanForSupplement(
      supplement.id,
      rateInput({
        rateMode: 'cyclic',
        rateOnDays: 1,
        rateOffDays: 1,
        rateAnchorDate: '2026-09-25',
      }),
    )
    expect(plan.rateOnDays).toBe(1)
    expect(plan.rateAnchorDate).toBe('2026-09-25')
  })

  it('daily 模式下节奏参数被归一化为空，不留半截数据', async () => {
    const supplement = await seedSupplement()
    const plan = await savePlanForSupplement(
      supplement.id,
      rateInput({ rateMode: 'daily', rateOnDays: 5, rateOffDays: 2, rateAnchorDate: '2026-09-25' }),
    )
    expect(plan.rateOnDays).toBeNull()
    expect(plan.rateOffDays).toBeNull()
    expect(plan.rateAnchorDate).toBeNull()
  })

  it('重复时段被去重', async () => {
    const supplement = await seedSupplement()
    const plan = await savePlanForSupplement(
      supplement.id,
      rateInput({ timeSlots: ['morning', 'morning', 'evening'] as unknown as ['morning'] }),
    )
    expect(plan.timeSlots.sort()).toEqual(['evening', 'morning'])
  })

  it('补剂不存在时抛错', async () => {
    await expect(savePlanForSupplement('not-exist', rateInput())).rejects.toThrow(/补剂不存在/)
  })
})

describe('hasActivePlan', () => {
  it('反映该补剂是否有启用计划', async () => {
    const supplement = await seedSupplement()
    expect(await hasActivePlan(supplement.id)).toBe(false)

    const plan = await savePlanForSupplement(supplement.id, rateInput())
    expect(await hasActivePlan(supplement.id)).toBe(true)
    expect(await hasActivePlan(supplement.id, plan.id)).toBe(false)
  })
})
