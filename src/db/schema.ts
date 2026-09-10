import Dexie, { type Table } from 'dexie'
import type {
  BodyFeedback,
  DailyIntake,
  DosagePlan,
  Ingredient,
  MetaRecord,
  PausePeriod,
  StockBatch,
  StockLog,
  Supplement,
  SupplementIngredient,
} from '@/types'

export const DB_NAME = 'suptrack'

/**
 * v10.1 最终 schema。新库直接从 version(1) 起步（决策 D1），
 * 旧版本数据的迁移走 db/migrations 中的纯函数，由导入流程调用。
 */
export class SupTrackDB extends Dexie {
  supplements!: Table<Supplement, string>
  ingredients!: Table<Ingredient, string>
  supplementIngredients!: Table<SupplementIngredient, string>
  dosagePlans!: Table<DosagePlan, string>
  dailyIntakes!: Table<DailyIntake, string>
  pausePeriods!: Table<PausePeriod, string>
  bodyFeedbacks!: Table<BodyFeedback, string>
  stockBatches!: Table<StockBatch, string>
  stockLogs!: Table<StockLog, string>
  meta!: Table<MetaRecord, string>

  constructor(name: string = DB_NAME) {
    super(name)
    this.version(1).stores({
      supplements: 'id, name, status, [deletedAt+status]',
      ingredients: 'id, name, deletedAt',
      supplementIngredients:
        'id, supplementId, ingredientId, [supplementId+ingredientId], effectiveFrom, deletedAt',
      // 注：IndexedDB 不接受 boolean 作为索引 key，故不建 isActive / [deletedAt+isActive]，
      // 启用状态在查询侧过滤；[deletedAt+supplementId] 承担"未删除计划"的索引职责。
      dosagePlans: 'id, supplementId, [deletedAt+supplementId], createdAt',
      dailyIntakes:
        'id, date, [date+supplementId], [date+timeSlot], planId, [deletedAt+date], stockState, plannedAmountSource',
      pausePeriods: 'id, supplementId, startDate, endDate, deletedAt',
      bodyFeedbacks: 'id, date, deletedAt',
      stockBatches: 'id, supplementId, isDepleted, deletedAt',
      stockLogs: 'id, supplementId, createdAt, [reason+relatedIntakeId], [deletedAt+createdAt]',
      meta: 'key',
    })
  }
}
