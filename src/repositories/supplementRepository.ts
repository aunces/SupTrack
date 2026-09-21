import { db } from '@/db'
import { SupplementCreateSchema, SupplementUpdateSchema } from '@/schemas/supplement'
import type { SupplementCreateInput, SupplementUpdateInput } from '@/schemas/supplement'
import type { Supplement } from '@/types'
import { nowIso } from '@/utils/id'
import { createRepository } from './base'

const base = createRepository<Supplement>(db.supplements)

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

  /** 手动调整余量：覆盖式赋值，不写流水、不记账（§6.5） */
  async setStockCount(id: string, stockCount: number | null): Promise<void> {
    await db.supplements.update(id, { stockCount, updatedAt: nowIso() })
  },

  /** 按名称查（导入去重、重名提示用） */
  async findByName(name: string): Promise<Supplement | undefined> {
    const rows = await db.supplements.where('name').equals(name).toArray()
    return rows[0]
  },
}
