import { z } from 'zod'
import { TIME_SLOT_VALUES } from '@/constants/enums'
import {
  DeletedAtSchema,
  IntSchema,
  IsoDateTimeSchema,
  OptionalNullableTextSchema,
  UuidSchema,
} from './common'

export const DosagePlanCreateSchema = z.object({
  id: UuidSchema,
  supplementId: z.string().min(1),
  dailyAmount: IntSchema.min(1, '每日服用量至少为 1'),
  timeSlots: z.array(z.enum(TIME_SLOT_VALUES)).min(1, '请至少选择一个服用时段'),
  withMeal: z.boolean(),
  isActive: z.boolean(),
  notes: OptionalNullableTextSchema,
  deletedAt: DeletedAtSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
})

export const DosagePlanUpdateSchema = z.object({
  supplementId: z.string().min(1).optional(),
  dailyAmount: IntSchema.min(1).optional(),
  timeSlots: z.array(z.enum(TIME_SLOT_VALUES)).min(1).optional(),
  withMeal: z.boolean().optional(),
  isActive: z.boolean().optional(),
  notes: OptionalNullableTextSchema,
  deletedAt: DeletedAtSchema.optional(),
  updatedAt: IsoDateTimeSchema.optional(),
})

export type DosagePlanCreateInput = z.infer<typeof DosagePlanCreateSchema>
export type DosagePlanUpdateInput = z.infer<typeof DosagePlanUpdateSchema>
