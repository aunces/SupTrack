/**
 * 领域模型（实施指导书 §5.2）。
 *
 * 字段名与 v12.2 需求 §6 逐字一致，除 §5.7 记录的实现化偏离外不得改动。
 * 已按新模型删除：DeletedAt / StockState / StockBatch / StockLog / BodyFeedback /
 * BackfillItem / BackfillResult / MissedPlan（R-04 / R-05 / v12.2 §5.6）。
 *
 * 设计要点：能用一个数字表达的，不建一张表；能用布尔表达的，不建枚举。
 */

import type { IngredientUnit, UnitType } from '@/constants/units'
import type { IntakeOrigin, RateMode, TimeSlot } from '@/constants/enums'

export type { IngredientUnit, IntakeOrigin, RateMode, TimeSlot, UnitType }

// ── 1. 补剂 ──────────────────────────────────────────────────
export interface Supplement {
  id: string
  name: string
  /** 每次吃的单位：capsule / tablet / pill / ... 共 10 种 */
  unitType: UnitType
  /** 余量（按服用单位计，整数，可为负）。null = 不记录 */
  stockCount: number | null
  /** 展示单位（瓶 / 盒），仅 UI 换算 */
  stockUnit: string | null
  /** 换算率：1 瓶 = 60 粒 */
  unitsPerStock: number | null
  /** yyyy-MM-dd */
  expiryDate: string | null
  notes: string | null
  /** ISO */
  createdAt: string
  updatedAt: string
}

// ── 2. 计划（含节奏） ─────────────────────────────────────────
export interface DosagePlan {
  id: string
  supplementId: string
  /** 每次服用量（不是每日量） */
  amountPerTime: number
  /** 非空、去重 */
  timeSlots: TimeSlot[]
  rateMode: RateMode
  /** cyclic 必填，≥1 */
  rateOnDays: number | null
  /** cyclic 必填，≥1 */
  rateOffDays: number | null
  /** cyclic 必填，节奏起点。起点之前该补剂不出现，不报错 */
  rateAnchorDate: string | null
  /** 启用 / 关闭（P6：计划关闭 ≠ 节奏休息） */
  isActive: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

// ── 3. 记录 ──────────────────────────────────────────────────
export interface DailyIntake {
  id: string
  /** 服用归属日期（补录时为用户所选历史日期）。yyyy-MM-dd */
  date: string
  supplementId: string
  /** 空 = 无计划（手动录入 / 计划外服用） */
  planId: string | null
  timeSlot: TimeSlot
  /** 实际服用量，整数 */
  amount: number
  /** true 吃了 / false 标记漏服 */
  taken: boolean
  /** = origin !== 'checkin'（由 Zod refine 强制，DIFF-01） */
  isExtra: boolean
  /** 来源，UI 据此标注（R-16） */
  origin: IntakeOrigin
  notes: string | null
  /** 真实写入时间（与 date 不同日时 UI 标「补录」） */
  createdAt: string
  updatedAt: string
}

// ── 4. 停药条目 ───────────────────────────────────────────────
export interface PausePeriod {
  id: string
  /** 空 = 临时停药 */
  schemeId: string | null
  /** 目标补剂，或 'ALL' 表示全部 */
  supplementId: string | 'ALL'
  /** 空 = 跟随方案组（仅在 schemeId 非空时合法） */
  startDate: string | null
  /** 空 = 持续中 */
  endDate: string | null
  /** 原因，UI 展示在今日页 */
  reason: string | null
  createdAt: string
  updatedAt: string
}

// ── 5. 停药方案组 ─────────────────────────────────────────────
export interface PauseScheme {
  id: string
  /** 如「抗生素期间」 */
  name: string
  note: string | null
  /** 是否执行中（同一时刻至多一组） */
  isActive: boolean
  /** 执行起始日 */
  activatedAt: string | null
  /** 结束日；空且 isActive = 持续中 */
  endedAt: string | null
  createdAt: string
  updatedAt: string
}

// ── 6. 成分（M3） ─────────────────────────────────────────────
export interface Ingredient {
  id: string
  /** 跨补剂归并的唯一锚点 */
  name: string
  /** mg / μg / g / IU / ml；重量类存储统一 μg */
  unit: IngredientUnit
  /** 参考摄入量，用户自填，系统不预置任何默认阈值 */
  recommendedDailyIntake: number | null
  /** 上限，用户自填 */
  upperLimit: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

// ── 7. 补剂-成分关联（M3） ────────────────────────────────────
export interface SupplementIngredient {
  id: string
  supplementId: string
  ingredientId: string
  /** 每份含量，整数 */
  amountPerServing: number
  /** 生效日 */
  effectiveFrom: string
  /** 失效日，空 = 当前有效 */
  effectiveTo: string | null
  createdAt: string
  updatedAt: string
}

// ── 8. 元数据 ────────────────────────────────────────────────
export interface MetaRecord {
  key: string
  value: unknown
}
