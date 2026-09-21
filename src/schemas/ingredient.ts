import { z } from 'zod'
import { INGREDIENT_UNIT, INGREDIENT_UNIT_VALUES, MCG_ALIAS } from '@/constants/units'
import { IsoDateTimeSchema, NonNegIntSchema, NullableTextSchema, UuidSchema } from './common'

/**
 * 成分（实施指导书 §5.2 / §5.5，M3 用，M1 只建表）。
 * 系统不预置任何默认阈值：参考摄入量与上限全部由用户自填，留空即「不比较」。
 */

/** 用户输入 mcg 自动转换为 μg */
export const IngredientUnitSchema = z
  .string()
  .transform((v) => (v.toLowerCase() === MCG_ALIAS ? INGREDIENT_UNIT.MCG : v))
  .pipe(z.enum(INGREDIENT_UNIT_VALUES))

const BaseShape = {
  name: z.string().min(1, '请填写成分名称'),
  unit: IngredientUnitSchema,
  /** 参考摄入量，用户自填。留空 = 不做比较 */
  recommendedDailyIntake: NonNegIntSchema.nullable(),
  /** 上限，用户自填。留空 = 不显示 */
  upperLimit: NonNegIntSchema.nullable(),
  notes: NullableTextSchema,
}

export const IngredientCreateSchema = z.object({
  id: UuidSchema,
  ...BaseShape,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
})

export const IngredientUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  unit: IngredientUnitSchema.optional(),
  recommendedDailyIntake: NonNegIntSchema.nullable().optional(),
  upperLimit: NonNegIntSchema.nullable().optional(),
  notes: NullableTextSchema.optional(),
  updatedAt: IsoDateTimeSchema.optional(),
})

export type IngredientCreateInput = z.infer<typeof IngredientCreateSchema>
export type IngredientUpdateInput = z.infer<typeof IngredientUpdateSchema>
