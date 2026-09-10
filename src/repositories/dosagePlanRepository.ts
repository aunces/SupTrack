import Dexie from 'dexie'
import { db } from '@/db'
import { DosagePlanCreateSchema, DosagePlanUpdateSchema } from '@/schemas/dosagePlan'
import type { DosagePlanCreateInput, DosagePlanUpdateInput } from '@/schemas/dosagePlan'
import type { DosagePlan } from '@/types'
import { nowIso } from '@/utils/id'
import { createRepository } from './base'

const base = createRepository<DosagePlan>(db.dosagePlans)

export const dosagePlanRepository = {
  ...base,

  async create(input: DosagePlanCreateInput): Promise<DosagePlan> {
    const record = DosagePlanCreateSchema.parse(input) as DosagePlan
    return base.insert(record)
  },

  async update(id: string, patch: DosagePlanUpdateInput): Promise<void> {
    const parsed = DosagePlanUpdateSchema.parse(patch)
    await base.update(id, { ...parsed, updatedAt: nowIso() } as Partial<DosagePlan>)
  },

  /**
   * 指定日期的启用计划。
   * onlyExistingAtDate = true 时仅返回 createdAt <= date 的计划（补录 / 次日提醒 / 日历完成度使用），
   * 避免"计划创建于该日之后却被当作应服项"的历史伪造。
   */
  async listActiveForDate(
    date: string,
    options: { onlyExistingAtDate?: boolean } = {},
  ): Promise<DosagePlan[]> {
    const rows = await db.dosagePlans
      .where('[deletedAt+supplementId]')
      .between([0, Dexie.minKey], [0, Dexie.maxKey])
      .toArray()

    const active = rows.filter((plan) => plan.isActive === true)
    if (!options.onlyExistingAtDate) return active

    const endOfDate = `${date}T23:59:59.999Z`
    return active.filter((plan) => plan.createdAt <= endOfDate)
  },

  async listBySupplement(supplementId: string, includeDeleted = false) {
    const rows = await db.dosagePlans.where('supplementId').equals(supplementId).toArray()
    return includeDeleted ? rows : rows.filter((r) => r.deletedAt === 0)
  },
}
