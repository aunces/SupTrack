import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { ALL_SUPPLEMENTS } from '@/constants/enums'
import {
  countRelatedRecords,
  createSupplement,
  deleteSupplement,
  setStockCount,
  updateSupplement,
} from '@/services/supplementService'
import { getStock, resetDb, seedIntake, seedPlan } from '../helpers/db'

beforeEach(async () => {
  await resetDb()
})

function draft(overrides: Record<string, unknown> = {}) {
  return {
    name: '维生素 D3',
    unitType: 'pill' as const,
    stockCount: 30,
    stockUnit: null,
    unitsPerStock: null,
    expiryDate: null,
    notes: null,
    ...overrides,
  }
}

describe('createSupplement', () => {
  it('单独建补剂：自动生成 id 与时间戳', async () => {
    const record = await createSupplement(draft())
    expect(record.id).toBeTruthy()
    expect(record.createdAt).toBe(record.updatedAt)
    expect(await db.supplements.count()).toBe(1)
  })

  it('可一并创建首条计划', async () => {
    const record = await createSupplement(draft(), {
      amountPerTime: 2,
      timeSlots: ['morning', 'evening'],
      rateMode: 'cyclic',
      rateOnDays: 1,
      rateOffDays: 1,
      rateAnchorDate: '2026-09-20',
    })

    const plans = await db.dosagePlans.where('supplementId').equals(record.id).toArray()
    expect(plans).toHaveLength(1)
    expect(plans[0].isActive).toBe(true)
    expect(plans[0].amountPerTime).toBe(2)
  })

  it('名称为空被拒，且不留下半截数据', async () => {
    await expect(createSupplement(draft({ name: '' }))).rejects.toThrow(/请填写补剂名称/)
    expect(await db.supplements.count()).toBe(0)
  })
})

describe('updateSupplement / setStockCount', () => {
  it('部分更新', async () => {
    const record = await createSupplement(draft())
    await updateSupplement(record.id, { name: '鱼油' })
    expect((await db.supplements.get(record.id))?.name).toBe('鱼油')
  })

  it('手动调整余量为覆盖式赋值', async () => {
    const record = await createSupplement(draft())
    await setStockCount(record.id, 12)
    expect(await getStock(record.id)).toBe(12)
    await setStockCount(record.id, null)
    expect(await getStock(record.id)).toBeNull()
  })

  it('更新不存在的补剂抛错', async () => {
    await expect(updateSupplement('not-exist', { name: 'x' })).rejects.toThrow(/补剂不存在/)
  })
})

describe('deleteSupplement · 级联规则（DIFF-03）', () => {
  async function seedFull() {
    const supplement = await createSupplement(draft())
    const plan = await seedPlan(supplement.id)
    await seedIntake({ supplementId: supplement.id, planId: plan.id })
    await seedIntake({ supplementId: supplement.id, timeSlot: 'evening' })
    await db.supplementIngredients.add({
      id: 'link-1',
      supplementId: supplement.id,
      ingredientId: 'ing-1',
      amountPerServing: 1000,
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    await db.pausePeriods.bulkAdd([
      {
        id: 'own-pause',
        schemeId: null,
        supplementId: supplement.id,
        startDate: '2026-09-19',
        endDate: null,
        reason: null,
        createdAt: '2026-09-19T00:00:00.000Z',
        updatedAt: '2026-09-19T00:00:00.000Z',
      },
      {
        id: 'all-pause',
        schemeId: null,
        supplementId: ALL_SUPPLEMENTS,
        startDate: '2026-09-19',
        endDate: null,
        reason: null,
        createdAt: '2026-09-19T00:00:00.000Z',
        updatedAt: '2026-09-19T00:00:00.000Z',
      },
    ])
    return supplement
  }

  it('删除补剂 + 删记录：补剂 / 计划 / 记录 / 关联全消失，ALL 停药条目保留', async () => {
    const supplement = await seedFull()

    await deleteSupplement(supplement.id, true)

    expect(await db.supplements.get(supplement.id)).toBeUndefined()
    expect(await db.dosagePlans.count()).toBe(0)
    expect(await db.dailyIntakes.count()).toBe(0)
    expect(await db.supplementIngredients.count()).toBe(0)
    expect((await db.pausePeriods.toArray()).map((p) => p.id)).toEqual(['all-pause'])
  })

  it('删除补剂 + 不删记录：补剂 / 计划消失，历史记录保留为孤儿', async () => {
    const supplement = await seedFull()

    await deleteSupplement(supplement.id, false)

    expect(await db.supplements.get(supplement.id)).toBeUndefined()
    expect(await db.dosagePlans.count()).toBe(0)
    expect(await db.dailyIntakes.count()).toBe(2)
    expect((await db.pausePeriods.toArray()).map((p) => p.id)).toEqual(['all-pause'])
  })

  it('删除不存在的补剂抛错', async () => {
    await expect(deleteSupplement('not-exist', true)).rejects.toThrow(/补剂不存在/)
  })
})

describe('countRelatedRecords', () => {
  it('与实际记录数一致（确认框里的 N 必须是真的）', async () => {
    const supplement = await createSupplement(draft())
    expect(await countRelatedRecords(supplement.id)).toBe(0)

    await seedIntake({ supplementId: supplement.id })
    await seedIntake({ supplementId: supplement.id, timeSlot: 'evening' })

    expect(await countRelatedRecords(supplement.id)).toBe(2)
  })
})
