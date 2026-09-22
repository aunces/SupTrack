/**
 * 枚举与阈值常量（实施指导书 §5.4）。
 *
 * 本文件只放「值域」与「写死不配置的阈值」，不放任何业务判断。
 * 已按新模型删除：INTAKE_STATUS / INTAKE_SOURCE / CYCLE_MODE / SUPPLEMENT_STATUS /
 * STOCK_LOG_REASON / PLANNED_AMOUNT_SOURCE / STOCK_BATCH_UNIT（R-04 / R-05 / v12.2 §5.6）。
 */

// ── 时段 ─────────────────────────────────────────────────────
export const TIME_SLOT = {
  MORNING: 'morning',
  NOON: 'noon',
  EVENING: 'evening',
  BEDTIME: 'bedtime',
} as const

export type TimeSlot = (typeof TIME_SLOT)[keyof typeof TIME_SLOT]

export const TIME_SLOT_VALUES = Object.values(TIME_SLOT) as [TimeSlot, ...TimeSlot[]]

export const TIME_SLOT_LABEL: Record<TimeSlot, string> = {
  morning: '早上',
  noon: '中午',
  evening: '晚上',
  bedtime: '睡前',
}

// ── 节奏模式 ─────────────────────────────────────────────────
export const RATE_MODE = {
  DAILY: 'daily',
  CYCLIC: 'cyclic',
} as const

export type RateMode = (typeof RATE_MODE)[keyof typeof RATE_MODE]

export const RATE_MODE_VALUES = Object.values(RATE_MODE) as [RateMode, ...RateMode[]]

// ── 停药方案组的周期模式（D-44） ────────────────────────────────
/**
 * ★ 这不是 v10.1 那个被删除的 `CYCLE_MODE`（它挂在**停药条目**上，已按 DQ-12 移除）。
 * 本枚举挂在**方案组**上，表达「从健康角度的周期疗程」——用户 2026-09-22 裁决，
 * 有意反转需求 §8.1 规则 2，理由与「不重现旧 bug」的机制见 docs/DECISIONS.md D-44。
 */
export const PAUSE_CYCLE_MODE = {
  /** 连续：执行后一直到停止为止。原有行为，也是旧数据的兜底语义 */
  CONTINUOUS: 'continuous',
  /** 周期：吃 N 天停 M 天，从「执行日」起循环（执行日 = 周期第 1 天） */
  CYCLIC: 'cyclic',
} as const

export type PauseCycleMode = (typeof PAUSE_CYCLE_MODE)[keyof typeof PAUSE_CYCLE_MODE]

export const PAUSE_CYCLE_MODE_VALUES = Object.values(PAUSE_CYCLE_MODE) as [
  PauseCycleMode,
  ...PauseCycleMode[],
]

export const PAUSE_CYCLE_MODE_LABEL: Record<PauseCycleMode, string> = {
  continuous: '连续',
  cyclic: '周期',
}

// ── 记录来源（R-16：每条记录必须可溯源） ───────────────────────
export const INTAKE_ORIGIN = {
  /** 计划内打卡 */
  CHECKIN: 'checkin',
  /** 追加一次（同一天吃了第二次） */
  EXTRA: 'extra',
  /** 仍要服用（休息日 / 停用期） */
  FORCED: 'forced',
  /** 补录 */
  BACKFILL: 'backfill',
  /** 手动录入（无计划） */
  MANUAL: 'manual',
} as const

export type IntakeOrigin = (typeof INTAKE_ORIGIN)[keyof typeof INTAKE_ORIGIN]

export const INTAKE_ORIGIN_VALUES = Object.values(INTAKE_ORIGIN) as [
  IntakeOrigin,
  ...IntakeOrigin[],
]

export const INTAKE_ORIGIN_LABEL: Record<IntakeOrigin, string> = {
  checkin: '计划打卡',
  extra: '追加一次',
  forced: '计划外服用',
  backfill: '补录',
  manual: '手动录入',
}

// ── 全部补剂（全局停药） ───────────────────────────────────────
/** PausePeriod.supplementId 取此值表示「全部补剂」，不单独做全局开关 */
export const ALL_SUPPLEMENTS = 'ALL'

// ── 阈值（全部写死，不做成设置项） ─────────────────────────────
/** 补录窗口（天），不含今天。固定值，不可配置（D-07） */
export const BACKFILL_WINDOW_DAYS = 7
/** 余量偏低：剩余可用天数 ≤ 该值（按日均消耗算，见 utils/rate.ts::rateDensity） */
export const LOW_STOCK_DAYS = 5
/** 临期提醒阈值（天） */
export const EXPIRY_WARNING_DAYS = 30
/** 备份提醒：距上次导出超过该天数（M3） */
export const BACKUP_REMIND_DAYS = 30
/** 密集折叠阈值：同时段「休息 + 停用」项 ≥ 该值时折叠（W-01） */
export const DENSE_COLLAPSE_THRESHOLD = 3
/** 月历每格最多标记数，超出显示 +N（W-05） */
export const CALENDAR_MAX_DOTS = 3
