import { z } from 'zod'
import {
  DeletedAtSchema,
  IntSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  OptionalNullableDateSchema,
  UuidSchema,
} from './common'

export const SupplementIngredientCreateSchema = z
  .object({
    id: UuidSchema,
    supplementId: z.string().min(1),
    ingredientId: z.string().min(1),
    amountPerServing: IntSchema,
    effectiveFrom: IsoDateSchema,
    effectiveTo: OptionalNullableDateSchema,
    deletedAt: DeletedAtSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .refine(
    (d) => d.effectiveTo == null || d.effectiveTo >= d.effectiveFrom,
    '失效日期不能早于生效日期',
  )

export const SupplementIngredientUpdateSchema = z
  .object({
    amountPerServing: IntSchema.optional(),
    effectiveFrom: IsoDateSchema.optional(),
    effectiveTo: OptionalNullableDateSchema,
    deletedAt: DeletedAtSchema.optional(),
    updatedAt: IsoDateTimeSchema.optional(),
  })
  .refine(
    (d) =>
      d.effectiveFrom === undefined || d.effectiveTo == null || d.effectiveTo >= d.effectiveFrom,
    '失效日期不能早于生效日期',
  )

export type SupplementIngredientCreateInput = z.infer<typeof SupplementIngredientCreateSchema>
export type SupplementIngredientUpdateInput = z.infer<typeof SupplementIngredientUpdateSchema>
