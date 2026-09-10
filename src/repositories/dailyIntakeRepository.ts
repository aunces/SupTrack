import { db } from '@/db'
import { NOT_DELETED } from '@/constants/deletedAt'
import type { DailyIntake } from '@/types'

/**
 * 注意：DailyIntake 的软删除与恢复必须走 services/stockService.applyTransition*，
 * 这里刻意不提供 softDelete / restore，避免绕过库存状态机。
 */
export const dailyIntakeRepository = {
  table: db.dailyIntakes,

  async get(id: string): Promise<DailyIntake | undefined> {
    return db.dailyIntakes.get(id)
  },

  async insert(record: DailyIntake): Promise<DailyIntake> {
    await db.dailyIntakes.add(record)
    return record
  },

  async bulkInsert(records: DailyIntake[]): Promise<void> {
    await db.dailyIntakes.bulkAdd(records)
  },

  async update(id: string, patch: Partial<DailyIntake>): Promise<void> {
    await db.dailyIntakes.update(id, patch)
  },

  async purge(id: string): Promise<void> {
    await db.dailyIntakes.delete(id)
  },

  /**
   * 未删除记录，按 [deletedAt+date] 复合索引。
   * 上界补 \uffff 以兼容 startDate === endDate 的单日查询（between 在等边界时不命中）。
   */
  async listByDateRange(startDate: string, endDate: string): Promise<DailyIntake[]> {
    return db.dailyIntakes
      .where('[deletedAt+date]')
      .between([NOT_DELETED, startDate], [NOT_DELETED, `${endDate}\uffff`])
      .toArray()
  },

  async listByDate(date: string): Promise<DailyIntake[]> {
    return dailyIntakeRepository.listByDateRange(date, date)
  },

  /** 含已删除记录（补录重复检测、次日提醒需要区分是否已软删除） */
  async listByDateRangeIncludingDeleted(
    startDate: string,
    endDate: string,
  ): Promise<DailyIntake[]> {
    const rows = await db.dailyIntakes
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray()
    return rows.filter((r) => r.date >= startDate && r.date <= endDate)
  },

  /** 事务内使用的重复检测：同一 date + supplementId + timeSlot 的未删除记录 */
  async findActive(
    date: string,
    supplementId: string,
    timeSlot: string,
  ): Promise<DailyIntake | undefined> {
    const rows = await db.dailyIntakes
      .where('[date+supplementId]')
      .equals([date, supplementId])
      .toArray()
    return rows.find((r) => r.timeSlot === timeSlot && r.deletedAt === NOT_DELETED)
  },

  async listByPlanId(planId: string): Promise<DailyIntake[]> {
    return db.dailyIntakes.where('planId').equals(planId).toArray()
  },

  async trash(): Promise<DailyIntake[]> {
    const rows = await db.dailyIntakes.filter((r) => r.deletedAt !== NOT_DELETED).toArray()
    return rows.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)))
  },
}
