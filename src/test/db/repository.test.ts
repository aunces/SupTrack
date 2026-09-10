import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import {
  dailyIntakeRepository,
  dosagePlanRepository,
  stockLogRepository,
  supplementIngredientRepository,
  supplementRepository,
} from '@/repositories'
import { NOT_DELETED } from '@/constants/deletedAt'
import type { DailyIntake, DosagePlan, StockLog, Supplement } from '@/types'
import { newId, nowIso } from '@/utils/id'

function supplement(overrides: Partial<Supplement> = {}): Supplement {
  const now = nowIso()
  return {
    id: newId(),
    name: '鱼油',
    brand: null,
    description: null,
    unitType: 'capsule',
    stockCountInUsageUnit: 90,
    stockUnit: null,
    unitsPerStock: null,
    productionDate: null,
    expiryDate: null,
    status: 'active',
    deletedAt: NOT_DELETED,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function plan(supplementId: string, overrides: Partial<DosagePlan> = {}): DosagePlan {
  const now = nowIso()
  return {
    id: newId(),
    supplementId,
    dailyAmount: 2,
    timeSlots: ['morning'],
    withMeal: true,
    isActive: true,
    notes: null,
    deletedAt: NOT_DELETED,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function intake(overrides: Partial<DailyIntake> = {}): DailyIntake {
  const now = nowIso()
  return {
    id: newId(),
    date: '2026-09-10',
    supplementId: 'supp',
    planId: null,
    plannedAmount: null,
    plannedAmountSnapshot: null,
    plannedAmountSource: 'unavailable',
    actualAmount: 1,
    timeSlot: 'morning',
    status: 'taken',
    source: 'manual',
    notes: null,
    stockState: 'deducted',
    deletedAt: NOT_DELETED,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function log(overrides: Partial<StockLog> = {}): StockLog {
  return {
    id: newId(),
    supplementId: 'supp',
    deltaInUsageUnit: -1,
    reason: 'intake',
    relatedIntakeId: null,
    note: null,
    deletedAt: NOT_DELETED,
    createdAt: nowIso(),
    ...overrides,
  }
}

describe('仓储层', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('查询默认过滤已软删除记录', async () => {
    const supp = await supplementRepository.create(supplement())
    expect(await supplementRepository.all()).toHaveLength(1)

    await supplementRepository.softDelete(supp.id)
    expect(await supplementRepository.all()).toHaveLength(0)
    expect(await supplementRepository.trash()).toHaveLength(1)

    await supplementRepository.restore(supp.id)
    expect(await supplementRepository.all()).toHaveLength(1)
  })

  it('补剂软删除级联到计划与成分关联，但保留摄入记录与流水', async () => {
    const supp = await supplementRepository.create(supplement())
    await dosagePlanRepository.create(plan(supp.id))
    await supplementIngredientRepository.create({
      id: newId(),
      supplementId: supp.id,
      ingredientId: 'ing-1',
      amountPerServing: 500,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      deletedAt: NOT_DELETED,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
    const record = await dailyIntakeRepository.insert(intake({ supplementId: supp.id }))

    await supplementRepository.softDeleteCascade(supp.id)

    expect(await dosagePlanRepository.all()).toHaveLength(0)
    expect(await supplementIngredientRepository.listBySupplement(supp.id)).toHaveLength(0)
    // 孤儿数据保留
    expect(await dailyIntakeRepository.get(record.id)).toBeDefined()
  })

  it('DailyIntake 复合索引 [deletedAt+date] 只返回未删除记录', async () => {
    const supp = await supplementRepository.create(supplement())
    await dailyIntakeRepository.insert(intake({ supplementId: supp.id, date: '2026-09-01' }))
    const deleted = await dailyIntakeRepository.insert(
      intake({ supplementId: supp.id, date: '2026-09-02' }),
    )
    await dailyIntakeRepository.update(deleted.id, {
      deletedAt: nowIso(),
      stockState: 'was_deducted',
    })

    const rows = await dailyIntakeRepository.listByDateRange('2026-09-01', '2026-09-30')
    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBe('2026-09-01')
  })

  it('findActive 按 date + supplementId + timeSlot 检测重复', async () => {
    const supp = await supplementRepository.create(supplement())
    await dailyIntakeRepository.insert(
      intake({ supplementId: supp.id, date: '2026-09-10', timeSlot: 'morning' }),
    )
    const found = await dailyIntakeRepository.findActive('2026-09-10', supp.id, 'morning')
    expect(found).toBeDefined()
    expect(await dailyIntakeRepository.findActive('2026-09-10', supp.id, 'evening')).toBeUndefined()
  })

  it('listActiveForDate 支持 onlyExistingAtDate 历史真实性过滤', async () => {
    const supp = await supplementRepository.create(supplement())
    await dosagePlanRepository.create(plan(supp.id, { createdAt: '2026-09-01T00:00:00.000Z' }))
    const later = await dosagePlanRepository.create(
      plan(supp.id, { createdAt: '2026-09-20T00:00:00.000Z' }),
    )

    const all = await dosagePlanRepository.listActiveForDate('2026-09-10')
    expect(all).toHaveLength(2)

    const onlyExisting = await dosagePlanRepository.listActiveForDate('2026-09-10', {
      onlyExistingAtDate: true,
    })
    expect(onlyExisting).toHaveLength(1)
    expect(onlyExisting[0].id).not.toBe(later.id)
  })

  it('StockLog 回收站分页使用 [deletedAt+createdAt] 复合索引', async () => {
    await stockLogRepository.insert(log({ id: 'log-1', createdAt: '2026-09-01T00:00:00.000Z' }))
    await stockLogRepository.insert(
      log({
        id: 'log-2',
        createdAt: '2026-09-02T00:00:00.000Z',
        deletedAt: '2026-09-03T00:00:00.000Z',
      }),
    )
    const trash = await stockLogRepository.trashPaged(0, 50)
    expect(trash).toHaveLength(1)
    expect(trash[0].id).toBe('log-2')
  })

  it('配方版本匹配按日期取当时有效记录', async () => {
    const suppId = 'supp-version'
    const oldLinkId = newId()
    const newLinkId = newId()
    await supplementIngredientRepository.create({
      id: oldLinkId,
      supplementId: suppId,
      ingredientId: 'ing-1',
      amountPerServing: 100,
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-06-30',
      deletedAt: NOT_DELETED,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
    await supplementIngredientRepository.create({
      id: newLinkId,
      supplementId: suppId,
      ingredientId: 'ing-1',
      amountPerServing: 200,
      effectiveFrom: '2026-07-01',
      effectiveTo: null,
      deletedAt: NOT_DELETED,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })

    expect((await supplementIngredientRepository.effectiveAt(suppId, '2026-03-01'))[0].id).toBe(
      oldLinkId,
    )
    expect((await supplementIngredientRepository.effectiveAt(suppId, '2026-09-01'))[0].id).toBe(
      newLinkId,
    )
  })
})
