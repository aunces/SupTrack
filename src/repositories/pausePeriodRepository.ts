import { db } from '@/db'
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

  async listBySupplement(supplementId: string, includeDeleted = false) {
    const rows = await db.pausePeriods.where('supplementId').equals(supplementId).toArray()
    return includeDeleted ? rows : rows.filter((r) => r.deletedAt === 0)
  },
}
