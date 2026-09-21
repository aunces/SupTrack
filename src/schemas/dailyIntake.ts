import { z } from 'zod'
import {
  INTAKE_ORIGIN,
  INTAKE_ORIGIN_VALUES,
  TIME_SLOT_VALUES,
  type IntakeOrigin,
} from '@/constants/enums'
import {
  IntSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  NullableTextSchema,
  UuidSchema,
} from './common'

/**
 * 记录（实施指导书 §5.2 / §5.5）。
 * 已删除 status / source / actualAmount / plannedAmount* / stockState / deletedAt：
 * 四态枚举收成「taken 布尔 + origin 枚举」，来源可溯源（R-16 / DIFF-01）。
 */

const BaseShape = {
  /** 服用归属日期（补录时为用户所选历史日期） */
  date: IsoDateSchema,
  supplementId: z.string().min(1),
  /** 空 = 无计划（手动录入 / 计划外服用） */
  planId: NullableTextSchema,
  timeSlot: z.enum(TIME_SLOT_VALUES),
  /** 实际服用量，整数 */
  amount: IntSchema.min(1, '服用量至少为 1'),
  taken: z.boolean(),
  isExtra: z.boolean(),
  origin: z.enum(INTAKE_ORIGIN_VALUES),
  notes: NullableTextSchema,
}

/** R-16 一致性：isExtra 由 origin 派生，两者不得各说各话（DIFF-01） */
function checkIsExtra(data: { isExtra?: boolean; origin?: IntakeOrigin }): boolean {
  if (data.isExtra === undefined || data.origin === undefined) return true
  return data.isExtra === (data.origin !== INTAKE_ORIGIN.CHECKIN)
}

/** 需求 §4.6：今天不能标漏服 —— taken=false 只允许出现在补录与手动录入里 */
function checkSkipped(data: { taken?: boolean; origin?: IntakeOrigin }): boolean {
  if (data.taken !== false || data.origin === undefined) return true
  return data.origin === INTAKE_ORIGIN.BACKFILL || data.origin === INTAKE_ORIGIN.MANUAL
}

export const DailyIntakeCreateSchema = z
  .object({
    id: UuidSchema,
    ...BaseShape,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .refine(checkIsExtra, { message: 'isExtra 必须与 origin 保持一致' })
  .refine(checkSkipped, { message: '只有补录或手动录入的记录才能标记漏服' })

export const DailyIntakeUpdateSchema = z
  .object({
    date: IsoDateSchema.optional(),
    supplementId: z.string().min(1).optional(),
    planId: NullableTextSchema.optional(),
    timeSlot: z.enum(TIME_SLOT_VALUES).optional(),
    amount: IntSchema.min(1).optional(),
    taken: z.boolean().optional(),
    isExtra: z.boolean().optional(),
    origin: z.enum(INTAKE_ORIGIN_VALUES).optional(),
    notes: NullableTextSchema.optional(),
    updatedAt: IsoDateTimeSchema.optional(),
  })
  .refine(checkIsExtra, { message: 'isExtra 必须与 origin 保持一致' })
  .refine(checkSkipped, { message: '只有补录或手动录入的记录才能标记漏服' })

export type DailyIntakeCreateInput = z.infer<typeof DailyIntakeCreateSchema>
export type DailyIntakeUpdateInput = z.infer<typeof DailyIntakeUpdateSchema>
