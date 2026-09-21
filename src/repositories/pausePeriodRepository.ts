import { db } from '@/db'
import { ALL_SUPPLEMENTS } from '@/constants/enums'
import { PausePeriodCreateSchema, PausePeriodUpdateSchema } from '@/schemas/pausePeriod'
import type { PausePeriodCreateInput, PausePeriodUpdateInput } from '@/schemas/pausePeriod'
import type { PausePeriod } from '@/types'
import { nowIso } from '@/utils/id'
import { createRepository } from './base'

const base = createRepository<PausePeriod>(db.pausePeriods)

export const pausePeriodRepository = {
  ...base,

  async create(input: PausePeriodCreateInput): Promise<PausePeriod> {
    const record = PausePeriodCreateSchema.parse(input) as PausePeriod
    return base.insert(record)
  },

  async update(id: string, patch: PausePeriodUpdateInput): Promise<void> {
    const parsed = PausePeriodUpdateSchema.parse(patch)
    await base.update(id, { ...parsed, updatedAt: nowIso() } as Partial<PausePeriod>)
  },

  async listBySupplement(supplementId: string): Promise<PausePeriod[]> {
    return db.pausePeriods.where('supplementId').equals(supplementId).toArray()
  },

  async listByScheme(schemeId: string): Promise<PausePeriod[]> {
    return db.pausePeriods.where('schemeId').equals(schemeId).toArray()
  },

  /**
   * 级联硬删除用（DIFF-03）。
   * 只删该补剂自己的条目：'ALL'（全局）条目不属于任何单个补剂，必须保留。
   */
  async deleteBySupplement(supplementId: string): Promise<number> {
    if (supplementId === ALL_SUPPLEMENTS) return 0
    const rows = await db.pausePeriods.where('supplementId').equals(supplementId).toArray()
    await db.pausePeriods.bulkDelete(rows.map((row) => row.id))
    return rows.length
  },
}
