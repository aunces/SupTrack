import { z } from 'zod'
import { RATE_MODE, RATE_MODE_VALUES, TIME_SLOT_VALUES, type RateMode } from '@/constants/enums'
import {
  IntSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  NullableIntSchema,
  NullableTextSchema,
  UuidSchema,
} from './common'

/**
 * 计划（含节奏）（实施指导书 §5.2 / §5.5）。
 * 已删除 dailyAmount / withMeal / deletedAt：
 * 节奏从「停药期」搬进计划（rateMode / rateOnDays / rateOffDays / rateAnchorDate）。
 */

type RateConfig = {
  rateMode: RateMode
  rateOnDays?: number | null
  rateOffDays?: number | null
  rateAnchorDate?: string | null
}

/** cyclic 必须补齐「吃几天 / 停几天 / 起点」；daily 一律宽容（填了也不报错） */
function checkRate(data: RateConfig): boolean {
  if (data.rateMode !== RATE_MODE.CYCLIC) return true
  return (
    data.rateOnDays != null &&
    data.rateOnDays >= 1 &&
    data.rateOffDays != null &&
    data.rateOffDays >= 1 &&
    data.rateAnchorDate != null
  )
}

const RATE_MESSAGE = '节奏参数不完整，请补齐「吃几天 / 停几天 / 起点」'

const BaseShape = {
  supplementId: z.string().min(1),
  /** 每次服用量（不是每日量） */
  amountPerTime: IntSchema.min(1, '每次服用量至少为 1'),
  timeSlots: z
    .array(z.enum(TIME_SLOT_VALUES))
    .min(1, '请至少选择一个服用时段')
    .refine((slots) => new Set(slots).size === slots.length, '服用时段不可重复'),
  rateMode: z.enum(RATE_MODE_VALUES),
  rateOnDays: NullableIntSchema,
  rateOffDays: NullableIntSchema,
  rateAnchorDate: IsoDateSchema.nullable(),
  isActive: z.boolean(),
  notes: NullableTextSchema,
}

export const DosagePlanCreateSchema = z
  .object({
    id: UuidSchema,
    ...BaseShape,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .refine(checkRate, { message: RATE_MESSAGE })

export const DosagePlanUpdateSchema = z
  .object({
    supplementId: z.string().min(1).optional(),
    amountPerTime: IntSchema.min(1).optional(),
    timeSlots: z
      .array(z.enum(TIME_SLOT_VALUES))
      .min(1)
      .refine((slots) => new Set(slots).size === slots.length, '服用时段不可重复')
      .optional(),
    rateMode: z.enum(RATE_MODE_VALUES).optional(),
    rateOnDays: NullableIntSchema.optional(),
    rateOffDays: NullableIntSchema.optional(),
    rateAnchorDate: IsoDateSchema.nullable().optional(),
    isActive: z.boolean().optional(),
    notes: NullableTextSchema.optional(),
    updatedAt: IsoDateTimeSchema.optional(),
  })
  .refine(
    // 部分更新时只在显式改 rateMode 的情况下校验，避免误报：
    // 把 rateMode 改成 cyclic，就必须在同一次 patch 里补齐 on/off/anchor。
    (d) => (d.rateMode === undefined ? true : checkRate({ ...d, rateMode: d.rateMode })),
    { message: RATE_MESSAGE },
  )

export type DosagePlanCreateInput = z.infer<typeof DosagePlanCreateSchema>
export type DosagePlanUpdateInput = z.infer<typeof DosagePlanUpdateSchema>
