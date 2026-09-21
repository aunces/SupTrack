import { z } from 'zod'
import { IsoDateSchema, IsoDateTimeSchema, NonNegIntSchema, UuidSchema } from './common'

/**
 * 补剂-成分关联（实施指导书 §5.2 / §5.5，M3 用，M1 只建表）。
 * 改配方不修改原记录：原记录 effectiveTo = 昨天，新建 effectiveFrom = 今天。
 * 因此失效记录必须保留可见（用户需要看到「改过配方」）。
 */
const BaseShape = {
  supplementId: z.string().min(1),
  ingredientId: z.string().min(1),
  /** 每份含量，整数 */
  amountPerServing: NonNegIntSchema,
  /** 生效日 */
  effectiveFrom: IsoDateSchema,
  /** 失效日，空 = 当前有效 */
  effectiveTo: IsoDateSchema.nullable(),
}

function checkEffectiveRange(data: {
  effectiveFrom?: string
  effectiveTo?: string | null
}): boolean {
  if (data.effectiveFrom === undefined || data.effectiveTo == null) return true
  return data.effectiveTo >= data.effectiveFrom
}

export const SupplementIngredientCreateSchema = z
  .object({
    id: UuidSchema,
    ...BaseShape,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .refine(checkEffectiveRange, { message: '失效日期不能早于生效日期' })

export const SupplementIngredientUpdateSchema = z
  .object({
    amountPerServing: NonNegIntSchema.optional(),
    effectiveFrom: IsoDateSchema.optional(),
    effectiveTo: IsoDateSchema.nullable().optional(),
    updatedAt: IsoDateTimeSchema.optional(),
  })
  .refine(checkEffectiveRange, { message: '失效日期不能早于生效日期' })

export type SupplementIngredientCreateInput = z.infer<typeof SupplementIngredientCreateSchema>
export type SupplementIngredientUpdateInput = z.infer<typeof SupplementIngredientUpdateSchema>
