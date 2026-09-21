import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { ALL_SUPPLEMENTS } from '@/constants/enums'
import {
  dailyIntakeRepository,
  dosagePlanRepository,
  pausePeriodRepository,
  pauseSchemeRepository,
  supplementRepository,
} from '@/repositories'
import { resetDb, seedIntake, seedPlan, seedSupplement, supplementFixture } from '../helpers/db'

beforeEach(async () => {
  await resetDb()
})

describe('base 仓储', () => {
  it('insert / get / update / remove 一把梭，没有软删除中间态', async () => {
    const record = supplementFixture()
    await supplementRepository.insert(record)
    expect((await supplementRepository.get(record.id))?.name).toBe(record.name)

    await supplementRepository.update(record.id, { stockCount: 5 })
    expect((await supplementRepository.get(record.id))?.stockCount).toBe(5)

    await supplementRepository.remove(record.id)
    expect(await supplementRepository.get(record.id)).toBeUndefined()
    expect(await supplementRepository.all()).toHaveLength(0)
  })
})

describe('supplementRepository', () => {
  it('setStockCount 是覆盖式赋值（可为 null、可为负）', async () => {
    const record = await seedSupplement({ stockCount: 10 })
    await supplementRepository.setStockCount(record.id, -2)
    expect((await db.supplements.get(record.id))?.stockCount).toBe(-2)

    await supplementRepository.setStockCount(record.id, null)
    expect((await db.supplements.get(record.id))?.stockCount).toBeNull()
  })
})

describe('dosagePlanRepository', () => {
  it('listActive / getActiveBySupplement / listBySupplement', async () => {
    const supplement = await seedSupplement()
    await seedPlan(supplement.id, { isActive: false, timeSlots: ['noon'] })
    const active = await seedPlan(supplement.id, { isActive: true })

    expect((await dosagePlanRepository.listActive()).map((p) => p.id)).toEqual([active.id])
    expect((await dosagePlanRepository.getActiveBySupplement(supplement.id))?.id).toBe(active.id)
    expect(await dosagePlanRepository.listBySupplement(supplement.id)).toHaveLength(2)
    expect(await dosagePlanRepository.countBySupplement(supplement.id)).toBe(2)
  })

  it('deleteBySupplement 只删该补剂的计划', async () => {
    const a = await seedSupplement({ name: 'A' })
    const b = await seedSupplement({ name: 'B' })
    await seedPlan(a.id)
    await seedPlan(b.id)

    expect(await dosagePlanRepository.deleteBySupplement(a.id)).toBe(1)
    expect(await dosagePlanRepository.listBySupplement(a.id)).toHaveLength(0)
    expect(await dosagePlanRepository.listBySupplement(b.id)).toHaveLength(1)
  })
})

describe('dailyIntakeRepository', () => {
  it('listByDate / listByDateRange 按 date 等值或闭区间查', async () => {
    await seedIntake({ date: '2026-09-19' })
    await seedIntake({ date: '2026-09-20' })
    await seedIntake({ date: '2026-09-22' })

    expect(await dailyIntakeRepository.listByDate('2026-09-20')).toHaveLength(1)
    expect(await dailyIntakeRepository.listByDateRange('2026-09-19', '2026-09-20')).toHaveLength(2)
    // 单日区间也必须命中（新模型不再需要补 \uffff）
    expect(await dailyIntakeRepository.listByDateRange('2026-09-20', '2026-09-20')).toHaveLength(1)
  })

  it('findActive 只认 taken=true：标了漏服的记录不阻止当天打卡', async () => {
    await seedIntake({ date: '2026-09-20', supplementId: 'supp-1', taken: false, origin: 'manual' })
    expect(
      await dailyIntakeRepository.findActive('2026-09-20', 'supp-1', 'morning'),
    ).toBeUndefined()

    await seedIntake({ date: '2026-09-20', supplementId: 'supp-1', taken: true })
    expect(await dailyIntakeRepository.findActive('2026-09-20', 'supp-1', 'morning')).toBeDefined()
    // 时段不同不算重复
    expect(
      await dailyIntakeRepository.findActive('2026-09-20', 'supp-1', 'evening'),
    ).toBeUndefined()
  })

  it('countBySupplement / deleteBySupplement', async () => {
    await seedIntake({ supplementId: 'a' })
    await seedIntake({ supplementId: 'a', timeSlot: 'evening' })
    await seedIntake({ supplementId: 'b' })

    expect(await dailyIntakeRepository.countBySupplement('a')).toBe(2)
    expect(await dailyIntakeRepository.deleteBySupplement('a')).toBe(2)
    expect(await dailyIntakeRepository.countBySupplement('a')).toBe(0)
    expect(await dailyIntakeRepository.countBySupplement('b')).toBe(1)
  })
})

describe('pausePeriodRepository', () => {
  it("deleteBySupplement 不删 'ALL' 全局条目（DIFF-03）", async () => {
    await db.pausePeriods.bulkAdd([
      {
        id: 'p-own',
        schemeId: null,
        supplementId: 'supp-1',
        startDate: '2026-09-19',
        endDate: null,
        reason: null,
        createdAt: '2026-09-19T00:00:00.000Z',
        updatedAt: '2026-09-19T00:00:00.000Z',
      },
      {
        id: 'p-all',
        schemeId: null,
        supplementId: ALL_SUPPLEMENTS,
        startDate: '2026-09-19',
        endDate: null,
        reason: null,
        createdAt: '2026-09-19T00:00:00.000Z',
        updatedAt: '2026-09-19T00:00:00.000Z',
      },
    ])

    expect(await pausePeriodRepository.deleteBySupplement('supp-1')).toBe(1)
    const rest = await pausePeriodRepository.all()
    expect(rest.map((p) => p.id)).toEqual(['p-all'])

    // 传 'ALL' 时一个都不删（防误用）
    expect(await pausePeriodRepository.deleteBySupplement(ALL_SUPPLEMENTS)).toBe(0)
  })
})

describe('pauseSchemeRepository', () => {
  it('getActiveScheme 返回执行中的那一组', async () => {
    const now = '2026-09-18T00:00:00.000Z'
    await db.pauseSchemes.bulkAdd([
      {
        id: 's-stop',
        name: '已停止',
        note: null,
        isActive: false,
        activatedAt: '2026-09-01',
        endedAt: '2026-09-05',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 's-active',
        name: '抗生素期间',
        note: null,
        isActive: true,
        activatedAt: '2026-09-18',
        endedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ])

    expect((await pauseSchemeRepository.getActiveScheme())?.id).toBe('s-active')
  })

  it('没有执行中的组时返回 undefined', async () => {
    expect(await pauseSchemeRepository.getActiveScheme()).toBeUndefined()
  })
})
