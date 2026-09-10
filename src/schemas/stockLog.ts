import { z } from 'zod'
import { STOCK_LOG_REASON_VALUES } from '@/constants/enums'
import {
  DeletedAtSchema,
  IntSchema,
  IsoDateTimeSchema,
  NullableTextSchema,
  UuidSchema,
} from './common'

export const StockLogCreateSchema = z.object({
  id: UuidSchema,
  supplementId: z.string().min(1),
  deltaInUsageUnit: IntSchema,
  reason: z.enum(STOCK_LOG_REASON_VALUES),
  relatedIntakeId: NullableTextSchema,
  note: NullableTextSchema,
  deletedAt: DeletedAtSchema,
  createdAt: IsoDateTimeSchema,
})

export const StockLogUpdateSchema = z.object({
  deletedAt: DeletedAtSchema.optional(),
  note: NullableTextSchema.optional(),
})

export type StockLogCreateInput = z.infer<typeof StockLogCreateSchema>
export type StockLogUpdateInput = z.infer<typeof StockLogUpdateSchema>
