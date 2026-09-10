import { subDays, format } from 'date-fns'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { NOT_DELETED } from '@/constants/deletedAt'
import { backfillBatch, detectMissedPlans } from '@/services/backfillService'
import { newId, nowIso } from '@/utils/id'
import type { TimeSlot } from '@/types'

/**
 * 性能冒烟测试。
 * 需求目标（真实浏览器 IndexedDB）：批量补录 100 项 < 500ms，次日提醒 < 100ms。
 * fake-indexeddb 明显慢于真实实现，这里用放宽阈值防止 CI 抖动，仅保证不出现数量级退化。
 */
const PERF_FACTOR = 6

function dayAgo(days: number): string {
  return format(subDays(new Date(), days), 'yyyy-MM-dd')
}

async function seed(count: number) {
  const supplements = Array.from({ length: count }, (_, index) => ({
    id: newId(),
    name: `补剂${index}`,
    brand: null,
    description: null,
    unitType: 'capsule' as const,
    stockCountInUsageUnit: 1000,
    stockUnit: null,
    unitsPerStock: null,
    productionDate: null,
    expiryDate: null,
    status: 'active' as const,
    deletedAt: NOT_DELETED,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }))
  await db.supplements.bulkAdd(supplements)

  await db.dosagePlans.bulkAdd(
    supplements.map((supplement) => ({
      id: newId(),
      supplementId: supplement.id,
      dailyAmount: 2,
      timeSlots: ['morning'] as TimeSlot[],
      withMeal: true,
      isActive: true,
      notes: null,
      deletedAt: NOT_DELETED,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    })),
  )

  return supplements
}

describe('性能冒烟', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('批量补录 100 项在单事务内完成', async () => {
    const supplements = await seed(100)
    const items = supplements.map((s) => ({
      supplementId: s.id,
      timeSlot: 'morning' as TimeSlot,
      choice: 'taken' as const,
    }))

    const start = performance.now()
    const result = await backfillBatch(items, dayAgo(1))
    const cost = performance.now() - start

    expect(result.created).toBe(100)
    expect(await db.dailyIntakes.count()).toBe(100)
    expect(await db.stockLogs.count()).toBe(100)
    expect(cost).toBeLessThan(500 * PERF_FACTOR)
  })

  it('次日提醒批量查询：7 天数据一次性读入后内存比对', async () => {
    const supplements = await seed(30)

    // 前 15 个补剂在过去 7 天均已记录，后 15 个缺失 → 应报 15 × 7 = 105 项
    const records = supplements.slice(0, 15).flatMap((supplement) =>
      Array.from({ length: 7 }, (_, index) => ({
        id: newId(),
        date: dayAgo(index + 1),
        supplementId: supplement.id,
        planId: null,
        plannedAmount: null,
        plannedAmountSnapshot: null,
        plannedAmountSource: 'unavailable' as const,
        actualAmount: 2,
        timeSlot: 'morning' as TimeSlot,
        status: 'taken' as const,
        source: 'manual' as const,
        notes: null,
        stockState: 'deducted' as const,
        deletedAt: NOT_DELETED,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })),
    )
    await db.dailyIntakes.bulkAdd(records)

    const start = performance.now()
    const missed = await detectMissedPlans()
    const cost = performance.now() - start

    expect(missed).toHaveLength(105)
    expect(cost).toBeLessThan(100 * PERF_FACTOR)
  })
})
