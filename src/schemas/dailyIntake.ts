import { z } from 'zod'
import {
  INTAKE_SOURCE_VALUES,
  INTAKE_STATUS_VALUES,
  PLANNED_AMOUNT_SOURCE_VALUES,
  TIME_SLOT_VALUES,
} from '@/constants/enums'
import { STOCK_STATE_VALUES } from '@/constants/stockState'
import {
  DeletedAtSchema,
  IntSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  NullableIntSchema,
  NullableTextSchema,
  UuidSchema,
} from './common'

/**
 * 新建 DailyIntake。
 * 注意：不含任何补录窗口的日期范围语义，范围校验全部下放 Service 层 validateIntakeDate(date, mode)。
 */
export const DailyIntakeCreateSchema = z
  .object({
    id: UuidSchema,
    date: IsoDateSchema,
    supplementId: z.string().min(1),
    planId: NullableTextSchema,
    /** @deprecated P2 清理 */
    plannedAmount: NullableIntSchema,
    plannedAmountSnapshot: NullableIntSchema,
    plannedAmountSource: z.enum(PLANNED_AMOUNT_SOURCE_VALUES),
    actualAmount: IntSchema,
    timeSlot: z.enum(TIME_SLOT_VALUES),
    status: z.enum(INTAKE_STATUS_VALUES),
    source: z.enum(INTAKE_SOURCE_VALUES),
    notes: NullableTextSchema,
    stockState: z.enum(STOCK_STATE_VALUES),
    deletedAt: DeletedAtSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .refine((d) => !(d.source === 'plan' && d.status === 'extra'), '计划来源不允许 extra 状态')
  .refine((d) => {
    // 四态与 deletedAt 一致性
    if (d.deletedAt === 0) {
      return d.stockState === 'deducted' || d.stockState === 'not_deducted'
    }
    return (
      d.stockState === 'not_deducted' ||
      d.stockState === 'was_deducted' ||
      d.stockState === 'unknown'
    )
  }, 'stockState 与 deletedAt 不一致')
  .refine(
    (d) =>
      !(d.status === 'skipped' && (d.stockState === 'deducted' || d.stockState === 'was_deducted')),
    'skipped 状态不能标记为已扣库存',
  )

/** 更新 DailyIntake（历史修正用）。refine 仅在相关字段存在时校验，避免部分更新误报 */
export const DailyIntakeUpdateSchema = z
  .object({
    date: IsoDateSchema.optional(),
    supplementId: z.string().min(1).optional(),
    planId: NullableTextSchema.optional(),
    plannedAmount: NullableIntSchema.optional(),
    plannedAmountSnapshot: NullableIntSchema.optional(),
    plannedAmountSource: z.enum(PLANNED_AMOUNT_SOURCE_VALUES).optional(),
    actualAmount: IntSchema.optional(),
    timeSlot: z.enum(TIME_SLOT_VALUES).optional(),
    status: z.enum(INTAKE_STATUS_VALUES).optional(),
    source: z.enum(INTAKE_SOURCE_VALUES).optional(),
    notes: NullableTextSchema.optional(),
    stockState: z.enum(STOCK_STATE_VALUES).optional(),
    deletedAt: DeletedAtSchema.optional(),
    updatedAt: IsoDateTimeSchema.optional(),
  })
  .refine((d) => !(d.source === 'plan' && d.status === 'extra'), '计划来源不允许 extra 状态')
  .refine((d) => {
    if (d.stockState === undefined || d.deletedAt === undefined) return true
    if (d.deletedAt === 0) {
      return d.stockState === 'deducted' || d.stockState === 'not_deducted'
    }
    return (
      d.stockState === 'not_deducted' ||
      d.stockState === 'was_deducted' ||
      d.stockState === 'unknown'
    )
  }, 'stockState 与 deletedAt 不一致')
  .refine((d) => {
    if (d.status === undefined || d.stockState === undefined) return true
    if (
      d.status === 'skipped' &&
      (d.stockState === 'deducted' || d.stockState === 'was_deducted')
    ) {
      return false
    }
    return true
  }, 'skipped 状态不能标记为已扣库存')

export type DailyIntakeCreateInput = z.infer<typeof DailyIntakeCreateSchema>
export type DailyIntakeUpdateInput = z.infer<typeof DailyIntakeUpdateSchema>
