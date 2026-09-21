import { z } from 'zod'
import { UNIT_TYPE_VALUES } from '@/constants/units'
import {
  IsoDateSchema,
  IsoDateTimeSchema,
  NullableIntSchema,
  NullableTextSchema,
  UuidSchema,
} from './common'

/**
 * 补剂（实施指导书 §5.2 / §5.5）。
 * 已删除 status / brand / description / productionDate / deletedAt / stockCountInUsageUnit：
 * 「启用状态」由计划的 isActive 承担，余量降为单一数字 stockCount（R-05）。
 */
const BaseShape = {
  name: z.string().min(1, '请填写补剂名称'),
  unitType: z.enum(UNIT_TYPE_VALUES),
  /** 余量（按服用单位计，整数，可为负）。null = 不记录余量 */
  stockCount: NullableIntSchema,
  /** 展示单位（瓶 / 盒），仅 UI 换算 */
  stockUnit: NullableTextSchema,
  /** 换算率：1 个展示单位 = 多少服用单位 */
  unitsPerStock: NullableIntSchema,
  expiryDate: IsoDateSchema.nullable(),
  notes: NullableTextSchema,
}

export const SupplementCreateSchema = z.object({
  id: UuidSchema,
  ...BaseShape,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
})

export const SupplementUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  unitType: z.enum(UNIT_TYPE_VALUES).optional(),
  stockCount: NullableIntSchema.optional(),
  stockUnit: NullableTextSchema.optional(),
  unitsPerStock: NullableIntSchema.optional(),
  expiryDate: IsoDateSchema.nullable().optional(),
  notes: NullableTextSchema.optional(),
  updatedAt: IsoDateTimeSchema.optional(),
})

export type SupplementCreateInput = z.infer<typeof SupplementCreateSchema>
export type SupplementUpdateInput = z.infer<typeof SupplementUpdateSchema>
