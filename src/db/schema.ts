import Dexie, { type Table } from 'dexie'
import type {
  DailyIntake,
  DosagePlan,
  Ingredient,
  MetaRecord,
  PausePeriod,
  PauseScheme,
  Supplement,
  SupplementIngredient,
} from '@/types'

/** 新库名：与旧库 suptrack 完全隔离（R-14，不做读取、不做兼容、不做迁移） */
export const DB_NAME = 'suptrack-v12'

/** 元数据键 */
export const META_KEY = {
  SCHEMA_VERSION: 'schemaVersion',
  LAST_EXPORT_AT: 'lastExportAt',
  APP_VERSION: 'appVersion',
} as const

/**
 * v12 schema：8 张表，version(1) 一次建好。
 *
 * 索引设计说明（改动前先读完，避免误改）：
 * - `[date+supplementId]` 承担「某日某补剂的记录」查询（今日页、重复打卡检测）。
 * - `[date+timeSlot]` 承担日历按日聚取。
 * - 单日区间查询用 `where('[date+supplementId]').equals([date, id])`，不要用 `between` 补 \uffff
 *   的老写法——新模型没有软删除，直接按 date 等值查即可。
 * - `ingredients` / `supplementIngredients` 在 M1 就建表（避免 M3 时再次升 schema），
 *   M1 只是不放任何入口。
 * - isActive 是 boolean，IndexedDB 不接受 boolean 作为索引 key，故不建索引、查询侧过滤；
 *   pauseSchemes 的「谁是执行中」由 activatedAt 承担排序。
 */
export class SupTrackDB extends Dexie {
  supplements!: Table<Supplement, string>
  dosagePlans!: Table<DosagePlan, string>
  dailyIntakes!: Table<DailyIntake, string>
  pausePeriods!: Table<PausePeriod, string>
  pauseSchemes!: Table<PauseScheme, string>
  meta!: Table<MetaRecord, string>
  ingredients!: Table<Ingredient, string>
  supplementIngredients!: Table<SupplementIngredient, string>

  constructor(name: string = DB_NAME) {
    super(name)
    this.version(1).stores({
      supplements: 'id, name',
      dosagePlans: 'id, supplementId',
      dailyIntakes: 'id, date, supplementId, planId, [date+supplementId], [date+timeSlot]',
      pausePeriods: 'id, supplementId, schemeId, startDate',
      pauseSchemes: 'id, name, activatedAt',
      meta: 'key',
      ingredients: 'id, name',
      supplementIngredients:
        'id, supplementId, ingredientId, effectiveFrom, effectiveTo, [supplementId+ingredientId]',
    })
  }
}
