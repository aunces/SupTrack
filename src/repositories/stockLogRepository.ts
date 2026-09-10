import { db } from '@/db'
import { NOT_DELETED } from '@/constants/deletedAt'
import type { StockLog } from '@/types'
import { createRepository } from './base'

const base = createRepository<StockLog>(db.stockLogs)

export const stockLogRepository = {
  ...base,

  async listBySupplement(supplementId: string, limit = 50): Promise<StockLog[]> {
    const rows = await db.stockLogs.where('supplementId').equals(supplementId).toArray()
    return rows
      .filter((r) => r.deletedAt === NOT_DELETED)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
  },

  /** 按关联记录查询。需求索引清单未给 relatedIntakeId 单列索引，故内存过滤 */
  async listByIntake(intakeId: string): Promise<StockLog[]> {
    const rows = await db.stockLogs.toArray()
    return rows.filter((r) => r.relatedIntakeId === intakeId)
  },

  /** 回收站分页：走 [deletedAt+createdAt] 复合索引排序后过滤已删除项 */
  async trashPaged(offset = 0, limit = 50): Promise<StockLog[]> {
    return db.stockLogs
      .orderBy('[deletedAt+createdAt]')
      .filter((r) => r.deletedAt !== NOT_DELETED)
      .reverse()
      .offset(offset)
      .limit(limit)
      .toArray()
  },
}
