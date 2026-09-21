import { z } from 'zod'
import { IsoDateSchema, IsoDateTimeSchema, NullableTextSchema, UuidSchema } from './common'

/**
 * 停药方案组（实施指导书 §5.2 / §5.5，新增于 M1 建表、M2 出界面）。
 * 「同一时刻至多一组执行中」由 pauseService.activateScheme 保证，不在 schema 里表达
 * （schema 只能看到单条记录，看不到集合约束）。
 */
const BaseShape = {
  name: z.string().min(1, '请填写方案名称'),
  note: NullableTextSchema,
  /** 是否执行中 */
  isActive: z.boolean(),
  /** 执行起始日 */
  activatedAt: IsoDateSchema.nullable(),
  /** 结束日；空且 isActive = 持续中 */
  endedAt: IsoDateSchema.nullable(),
}

function checkDateOrder(data: { activatedAt?: string | null; endedAt?: string | null }): boolean {
  if (data.endedAt == null || data.activatedAt == null) return true
  return data.endedAt >= data.activatedAt
}

export const PauseSchemeCreateSchema = z
  .object({
    id: UuidSchema,
    ...BaseShape,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .refine(checkDateOrder, { message: '结束日期不能早于执行日期' })

export const PauseSchemeUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    note: NullableTextSchema.optional(),
    isActive: z.boolean().optional(),
    activatedAt: IsoDateSchema.nullable().optional(),
    endedAt: IsoDateSchema.nullable().optional(),
    updatedAt: IsoDateTimeSchema.optional(),
  })
  .refine(checkDateOrder, { message: '结束日期不能早于执行日期' })

export type PauseSchemeCreateInput = z.infer<typeof PauseSchemeCreateSchema>
export type PauseSchemeUpdateInput = z.infer<typeof PauseSchemeUpdateSchema>
