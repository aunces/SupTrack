import { db } from '@/db'
import { DosagePlanCreateSchema, DosagePlanUpdateSchema } from '@/schemas/dosagePlan'
import type { DosagePlanCreateInput, DosagePlanUpdateInput } from '@/schemas/dosagePlan'
import type { DosagePlan } from '@/types'
import { nowIso } from '@/utils/id'
import { createRepository } from './base'

const base = createRepository<DosagePlan>(db.dosagePlans)

/**
 * isActive 是 boolean，IndexedDB 不接受 boolean 作索引 key，故不建索引、查询侧过滤。
 */
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

  /** 全部启用计划（今日页渲染用） */
  async listActive(): Promise<DosagePlan[]> {
    const rows = await db.dosagePlans.toArray()
    return rows.filter((plan) => plan.isActive)
  },

  /** 该补剂的启用计划。DIFF-02 保证至多一条 */
  async getActiveBySupplement(supplementId: string): Promise<DosagePlan | undefined> {
    const rows = await db.dosagePlans.where('supplementId').equals(supplementId).toArray()
    return rows.find((plan) => plan.isActive)
  },

  /** 该补剂全部计划（含已关闭，补剂页「已关闭」展示用） */
  async listBySupplement(supplementId: string): Promise<DosagePlan[]> {
    return db.dosagePlans.where('supplementId').equals(supplementId).toArray()
  },

  /** 级联硬删除用（删补剂时） */
  async deleteBySupplement(supplementId: string): Promise<number> {
    const rows = await db.dosagePlans.where('supplementId').equals(supplementId).toArray()
    await db.dosagePlans.bulkDelete(rows.map((row) => row.id))
    return rows.length
  },

  async countBySupplement(supplementId: string): Promise<number> {
    return db.dosagePlans.where('supplementId').equals(supplementId).count()
  },
}
