import Dexie from 'dexie'
import { db } from '@/db'
import {
  SupplementIngredientCreateSchema,
  SupplementIngredientUpdateSchema,
} from '@/schemas/supplementIngredient'
import type {
  SupplementIngredientCreateInput,
  SupplementIngredientUpdateInput,
} from '@/schemas/supplementIngredient'
import type { SupplementIngredient } from '@/types'
import { nowIso } from '@/utils/id'
import { createRepository } from './base'

const base = createRepository<SupplementIngredient>(db.supplementIngredients)

export const supplementIngredientRepository = {
  ...base,

  async create(input: SupplementIngredientCreateInput): Promise<SupplementIngredient> {
    const record = SupplementIngredientCreateSchema.parse(input) as SupplementIngredient
    return base.insert(record)
  },

  async update(id: string, patch: SupplementIngredientUpdateInput): Promise<void> {
    const parsed = SupplementIngredientUpdateSchema.parse(patch)
    await base.update(id, { ...parsed, updatedAt: nowIso() } as Partial<SupplementIngredient>)
  },

  /**
   * 按日期匹配当时有效的配方（需求 5.4）：
   * effectiveFrom <= date <= effectiveTo（effectiveTo 为空表示当前有效）。
   * includeDeleted 默认为 true —— 汇总计算需要包含已删除关联。
   */
  async effectiveAt(supplementId: string, date: string, includeDeleted = true) {
    const rows = await db.supplementIngredients
      .where('[supplementId+ingredientId]')
      .between([supplementId, Dexie.minKey], [supplementId, Dexie.maxKey])
      .toArray()

    return rows.filter((row) => {
      if (!includeDeleted && row.deletedAt !== 0) return false
      if (row.effectiveFrom > date) return false
      if (row.effectiveTo != null && row.effectiveTo < date) return false
      return true
    })
  },

  async listBySupplement(supplementId: string, includeDeleted = false) {
    const rows = await db.supplementIngredients.where('supplementId').equals(supplementId).toArray()
    return includeDeleted ? rows : rows.filter((r) => r.deletedAt === 0)
  },
}
