import type {
  CycleMode,
  IntakeSource,
  IntakeStatus,
  PlannedAmountSource,
  StockLogReason,
  SupplementStatus,
  TimeSlot,
} from '@/constants/enums'
import type { IngredientUnit, UnitType } from '@/constants/units'
import type { DeletedAt } from '@/constants/deletedAt'
import type { StockState } from '@/constants/stockState'
import type { StockBatchUnit } from '@/constants/enums'

export type { DeletedAt, StockState, PlannedAmountSource }
export type {
  UnitType,
  IngredientUnit,
  TimeSlot,
  IntakeStatus,
  IntakeSource,
  CycleMode,
  SupplementStatus,
  StockLogReason,
  StockBatchUnit,
}

export interface Supplement {
  id: string
  name: string
  brand?: string | null
  description?: string | null
  unitType: UnitType
  /** 当前库存（按服用单位计，整数，可为负）。null 表示不记录库存 */
  stockCountInUsageUnit?: number | null
  stockUnit?: string | null
  unitsPerStock?: number | null
  productionDate?: string | null
  expiryDate?: string | null
  status: SupplementStatus
  deletedAt: DeletedAt
  createdAt: string
  updatedAt: string
}

export interface Ingredient {
  id: string
  name: string
  unit: IngredientUnit
  recommendedDailyIntake?: number | null
  upperLimit?: number | null
  description?: string | null
  deletedAt: DeletedAt
}

export interface SupplementIngredient {
  id: string
  supplementId: string
  ingredientId: string
  amountPerServing: number
  effectiveFrom: string
  effectiveTo?: string | null
  deletedAt: DeletedAt
  createdAt: string
  updatedAt: string
}

export interface DosagePlan {
  id: string
  supplementId: string
  dailyAmount: number
  timeSlots: TimeSlot[]
  withMeal: boolean
  isActive: boolean
  notes?: string | null
  deletedAt: DeletedAt
  createdAt: string
  updatedAt: string
}

export interface DailyIntake {
  id: string
  date: string
  supplementId: string
  planId?: string | null
  /** @deprecated 计划量快照，v10 起新记录不再写入，P2 清理 */
  plannedAmount?: number | null
  plannedAmountSnapshot?: number | null
  plannedAmountSource: PlannedAmountSource
  actualAmount: number
  timeSlot: TimeSlot
  status: IntakeStatus
  source: IntakeSource
  notes?: string | null
  stockState: StockState
  deletedAt: DeletedAt
  createdAt: string
  updatedAt: string
}

export interface PausePeriod {
  id: string
  supplementId?: string | null
  startDate: string
  endDate?: string | null
  reason?: string | null
  cycleMode: CycleMode
  cycleStartDate?: string | null
  cycleOnDays?: number | null
  cycleOffDays?: number | null
  deletedAt: DeletedAt
  createdAt: string
  updatedAt: string
}

export interface BodyFeedback {
  id: string
  date: string
  energy: number
  sleep: number
  digestion: number
  mood: number
  notes?: string | null
  deletedAt: DeletedAt
  createdAt: string
  updatedAt: string
}

export interface StockBatch {
  id: string
  supplementId: string
  quantity: number
  unit: StockBatchUnit
  conversionRate?: number | null
  expiryDate?: string | null
  productionDate?: string | null
  isDepleted: boolean
  deletedAt: DeletedAt
  createdAt: string
  updatedAt: string
}

export interface StockLog {
  id: string
  supplementId: string
  deltaInUsageUnit: number
  reason: StockLogReason
  relatedIntakeId?: string | null
  note?: string | null
  deletedAt: DeletedAt
  createdAt: string
}

export interface MetaRecord {
  key: string
  value: unknown
}

/** 补录弹窗中的一项 */
export interface BackfillItem {
  supplementId: string
  timeSlot: TimeSlot
  /** 已服用 / 部分服用 / 漏服 */
  choice: 'taken' | 'partial' | 'skipped'
  /** 不传时取计划量，无计划取 1 */
  actualAmount?: number
}

export interface BackfillSkippedItem {
  supplementId: string
  name: string
  timeSlot?: TimeSlot
}

export interface BackfillResult {
  created: number
  /** 该时段已有未删除记录 */
  skippedExisting: BackfillSkippedItem[]
  /** 临期补剂 */
  skippedExpiring: BackfillSkippedItem[]
  /** 扣减后库存为负的补剂 */
  negativeStock: Array<{ supplementId: string; name: string; stock: number }>
}

/** 次日提醒：计划内未记录项 */
export interface MissedPlan {
  date: string
  supplementId: string
  timeSlot: TimeSlot
  plan: DosagePlan
}
