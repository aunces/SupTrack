import { z } from 'zod'
import { MCG_ALIAS, INGREDIENT_UNIT, INGREDIENT_UNIT_VALUES } from '@/constants/units'
import { DeletedAtSchema, OptionalNullableIntSchema, OptionalNullableTextSchema } from './common'

/** 用户输入 mcg 自动转换为 μg */
export const IngredientUnitSchema = z
  .string()
  .transform((v) => (v.toLowerCase() === MCG_ALIAS ? INGREDIENT_UNIT.MCG : v))
  .pipe(z.enum(INGREDIENT_UNIT_VALUES))

export const IngredientCreateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, '请填写成分名称'),
  unit: IngredientUnitSchema,
  recommendedDailyIntake: OptionalNullableIntSchema,
  upperLimit: OptionalNullableIntSchema,
  description: OptionalNullableTextSchema,
  deletedAt: DeletedAtSchema,
})

export const IngredientUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  unit: IngredientUnitSchema.optional(),
  recommendedDailyIntake: OptionalNullableIntSchema,
  upperLimit: OptionalNullableIntSchema,
  description: OptionalNullableTextSchema,
  deletedAt: DeletedAtSchema.optional(),
})

export type IngredientCreateInput = z.infer<typeof IngredientCreateSchema>
export type IngredientUpdateInput = z.infer<typeof IngredientUpdateSchema>
