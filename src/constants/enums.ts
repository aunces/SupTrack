export const TIME_SLOT = {
  MORNING: 'morning',
  NOON: 'noon',
  EVENING: 'evening',
  BEDTIME: 'bedtime',
} as const

export type TimeSlot = (typeof TIME_SLOT)[keyof typeof TIME_SLOT]

export const TIME_SLOT_LABEL: Record<TimeSlot, string> = {
  morning: '早',
  noon: '中',
  evening: '晚',
  bedtime: '睡前',
}

export const TIME_SLOT_VALUES = Object.values(TIME_SLOT) as [TimeSlot, ...TimeSlot[]]

export const INTAKE_STATUS = {
  TAKEN: 'taken',
  SKIPPED: 'skipped',
  EXTRA: 'extra',
  PARTIAL: 'partial',
} as const

export type IntakeStatus = (typeof INTAKE_STATUS)[keyof typeof INTAKE_STATUS]

export const INTAKE_STATUS_LABEL: Record<IntakeStatus, string> = {
  taken: '已服用',
  skipped: '漏服',
  extra: '多服',
  partial: '部分服用',
}

export const INTAKE_STATUS_VALUES = Object.values(INTAKE_STATUS) as [
  IntakeStatus,
  ...IntakeStatus[],
]

export const INTAKE_SOURCE = {
  PLAN: 'plan',
  MANUAL: 'manual',
} as const

export type IntakeSource = (typeof INTAKE_SOURCE)[keyof typeof INTAKE_SOURCE]

export const INTAKE_SOURCE_VALUES = Object.values(INTAKE_SOURCE) as [
  IntakeSource,
  ...IntakeSource[],
]

export const CYCLE_MODE = {
  NONE: 'none',
  ONE_TIME: 'oneTime',
  CYCLIC: 'cyclic',
} as const

export type CycleMode = (typeof CYCLE_MODE)[keyof typeof CYCLE_MODE]

export const CYCLE_MODE_LABEL: Record<CycleMode, string> = {
  none: '不循环',
  oneTime: '一次性',
  cyclic: '周期性',
}

export const CYCLE_MODE_VALUES = Object.values(CYCLE_MODE) as [CycleMode, ...CycleMode[]]

export const SUPPLEMENT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  FINISHED: 'finished',
} as const

export type SupplementStatus = (typeof SUPPLEMENT_STATUS)[keyof typeof SUPPLEMENT_STATUS]

export const SUPPLEMENT_STATUS_LABEL: Record<SupplementStatus, string> = {
  active: '使用中',
  inactive: '已停用',
  finished: '已用完',
}

export const SUPPLEMENT_STATUS_VALUES = Object.values(SUPPLEMENT_STATUS) as [
  SupplementStatus,
  ...SupplementStatus[],
]

export const STOCK_LOG_REASON = {
  INTAKE: 'intake',
  MANUAL_INTAKE: 'manual_intake',
  UNDO_INTAKE: 'undo_intake',
  RESTOCK: 'restock',
  ADJUST: 'adjust',
  PURGE_ROLLBACK: 'purge_rollback',
} as const

export type StockLogReason = (typeof STOCK_LOG_REASON)[keyof typeof STOCK_LOG_REASON]

export const STOCK_LOG_REASON_LABEL: Record<StockLogReason, string> = {
  intake: '服用扣减',
  manual_intake: '手动录入扣减',
  undo_intake: '撤销回滚',
  restock: '补货入库',
  adjust: '库存调整',
  purge_rollback: '历史版本回滚（已废弃）',
}

export const STOCK_LOG_REASON_VALUES = Object.values(STOCK_LOG_REASON) as [
  StockLogReason,
  ...StockLogReason[],
]

export const PLANNED_AMOUNT_SOURCE = {
  PLAN_SNAPSHOT: 'plan_snapshot',
  CURRENT_PLAN: 'current_plan',
  UNAVAILABLE: 'unavailable',
} as const

export type PlannedAmountSource = (typeof PLANNED_AMOUNT_SOURCE)[keyof typeof PLANNED_AMOUNT_SOURCE]

export const PLANNED_AMOUNT_SOURCE_VALUES = Object.values(PLANNED_AMOUNT_SOURCE) as [
  PlannedAmountSource,
  ...PlannedAmountSource[],
]

export const STOCK_BATCH_UNIT = {
  USAGE: 'usage',
  STOCK: 'stock',
} as const

export type StockBatchUnit = (typeof STOCK_BATCH_UNIT)[keyof typeof STOCK_BATCH_UNIT]

export const META_KEY = {
  SCHEMA_VERSION: 'schemaVersion',
  LAST_EXPORT_AT: 'lastExportAt',
  APP_VERSION: 'appVersion',
  BACKFILL_WINDOW_DAYS: 'backfillWindowDays',
} as const

export type MetaKey = (typeof META_KEY)[keyof typeof META_KEY]

export const DEFAULT_BACKFILL_WINDOW_DAYS = 30
/** 临期提醒阈值（天） */
export const DEFAULT_EXPIRY_WARNING_DAYS = 30
/** 库存不足阈值：剩余用量不足该天数 */
export const DEFAULT_LOW_STOCK_DAYS = 7
/** 次日提醒检测范围固定 7 天 */
export const MISSED_PLAN_DETECT_DAYS = 7
/** 次日提醒缓存时长 5 分钟 */
export const MISSED_PLAN_CACHE_MS = 5 * 60 * 1000
