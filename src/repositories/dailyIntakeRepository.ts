import { db } from '@/db'
import type { TimeSlot } from '@/constants/enums'
import { newId, nowIso } from '@/utils/id'
import type { DailyIntake } from '@/types'
import { createRepository } from './base'

const base = createRepository<DailyIntake>(db.dailyIntakes)

export const dailyIntakeRepository = {
  ...base,

  async insert(record: DailyIntake): Promise<DailyIntake> {
    await db.dailyIntakes.add(record)
    return record
  },

  /**
   * 某日全部记录。
   * 新模型没有软删除，直接按 date 等值查即可，不再需要 between + \uffff 的老写法。
   */
  async listByDate(date: string): Promise<DailyIntake[]> {
    return db.dailyIntakes.where('date').equals(date).toArray()
  },

  /** 闭区间 [startDate, endDate]，日历与成分汇总用 */
  async listByDateRange(startDate: string, endDate: string): Promise<DailyIntake[]> {
    return db.dailyIntakes.where('date').between(startDate, endDate, true, true).toArray()
  },

  /**
   * 幂等检查用：某日某补剂某时段是否已有「已服用」记录。
   * 只认 taken=true —— 标了漏服的记录不应阻止用户当天补打卡。
   */
  async findActive(
    date: string,
    supplementId: string,
    timeSlot: TimeSlot,
  ): Promise<DailyIntake | undefined> {
    const rows = await db.dailyIntakes
      .where('[date+supplementId]')
      .equals([date, supplementId])
      .toArray()
    return rows.find((row) => row.timeSlot === timeSlot && row.taken)
  },

  async listByPlanId(planId: string): Promise<DailyIntake[]> {
    return db.dailyIntakes.where('planId').equals(planId).toArray()
  },

  async countBySupplement(supplementId: string): Promise<number> {
    return db.dailyIntakes.where('supplementId').equals(supplementId).count()
  },

  /** 级联硬删除用（删补剂且勾选「同时删除历史记录」时） */
  async deleteBySupplement(supplementId: string): Promise<number> {
    const rows = await db.dailyIntakes.where('supplementId').equals(supplementId).toArray()
    await db.dailyIntakes.bulkDelete(rows.map((row) => row.id))
    return rows.length
  },

  /** 事务内构造一条记录（service 用，统一 id 与时间戳来源） */
  build(record: Omit<DailyIntake, 'id' | 'createdAt' | 'updatedAt'>): DailyIntake {
    const now = nowIso()
    return { ...record, id: newId(), createdAt: now, updatedAt: now }
  },
}
