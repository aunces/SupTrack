import { db } from '@/db'
import { STOCK_LOG_REASON } from '@/constants/enums'
import { SupplementCreateSchema, SupplementUpdateSchema } from '@/schemas/supplement'
import type { Supplement } from '@/types'
import type { SupplementCreateInput, SupplementUpdateInput } from '@/schemas/supplement'
import { newId, nowIso } from '@/utils/id'
import { createRepository } from './base'

const base = createRepository<Supplement>(db.supplements)

/**
 * 级联软删除（需求 5.7）：
 * - DosagePlan / SupplementIngredient 级联软删除
 * - DailyIntake / StockLog 保留（孤儿数据）
 * - PausePeriod 不级联
 */
async function softDeleteCascade(id: string): Promise<void> {
  const now = nowIso()
  await db.transaction('rw', db.supplements, db.dosagePlans, db.supplementIngredients, async () => {
    await db.supplements.update(id, { deletedAt: now, updatedAt: now })
    const plans = await db.dosagePlans.where('supplementId').equals(id).toArray()
    for (const plan of plans) {
      if (plan.deletedAt === 0) {
        await db.dosagePlans.update(plan.id, { deletedAt: now, updatedAt: now })
      }
    }
    const links = await db.supplementIngredients.where('supplementId').equals(id).toArray()
    for (const link of links) {
      if (link.deletedAt === 0) {
        await db.supplementIngredients.update(link.id, { deletedAt: now, updatedAt: now })
      }
    }
  })
}

export const supplementRepository = {
  ...base,

  async create(input: SupplementCreateInput): Promise<Supplement> {
    const record = SupplementCreateSchema.parse(input) as Supplement
    return base.insert(record)
  },

  async update(id: string, patch: SupplementUpdateInput): Promise<void> {
    const parsed = SupplementUpdateSchema.parse(patch)
    await base.update(id, { ...parsed, updatedAt: nowIso() } as Partial<Supplement>)
  },

  softDeleteCascade,

  /** 手动调整库存：更新库存并写 adjust 流水 */
  async adjustStock(supplementId: string, delta: number, note: string | null = null) {
    if (delta === 0) return
    const now = nowIso()
    await db.transaction('rw', db.supplements, db.stockLogs, async () => {
      const supp = await db.supplements.get(supplementId)
      if (!supp || supp.stockCountInUsageUnit == null) return
      await db.supplements.update(supplementId, {
        stockCountInUsageUnit: supp.stockCountInUsageUnit + delta,
        updatedAt: now,
      })
      await db.stockLogs.add({
        id: newId(),
        supplementId,
        deltaInUsageUnit: delta,
        reason: delta > 0 ? STOCK_LOG_REASON.RESTOCK : STOCK_LOG_REASON.ADJUST,
        relatedIntakeId: null,
        note,
        deletedAt: 0,
        createdAt: now,
      })
    })
  },
}
