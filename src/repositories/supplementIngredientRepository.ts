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
   * 按日期匹配当时有效的配方：
   * effectiveFrom <= date <= effectiveTo（effectiveTo 为空表示当前有效）。
   * 已失效的关联也要返回 —— 回看历史需要按「当时的配方」算（§8.5）。
   */
  async effectiveAt(supplementId: string, date: string): Promise<SupplementIngredient[]> {
    const rows = await db.supplementIngredients
      .where('[supplementId+ingredientId]')
      .between([supplementId, Dexie.minKey], [supplementId, Dexie.maxKey])
      .toArray()

    return rows.filter((row) => {
      if (row.effectiveFrom > date) return false
      if (row.effectiveTo != null && row.effectiveTo < date) return false
      return true
    })
  },

  async listBySupplement(supplementId: string): Promise<SupplementIngredient[]> {
    return db.supplementIngredients.where('supplementId').equals(supplementId).toArray()
  },

  /** 级联硬删除用（删补剂时） */
  async deleteBySupplement(supplementId: string): Promise<number> {
    const rows = await db.supplementIngredients.where('supplementId').equals(supplementId).toArray()
    await db.supplementIngredients.bulkDelete(rows.map((row) => row.id))
    return rows.length
  },
}
