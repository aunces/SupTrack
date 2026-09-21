import { z } from 'zod'
import { IsoDateSchema, IsoDateTimeSchema, NullableTextSchema, UuidSchema } from './common'

/**
 * 停药条目（实施指导书 §5.2 / §5.5）。
 * 已删除 cycleMode / cycleStartDate / cycleOnDays / cycleOffDays：节奏搬到计划上；
 * supplementId 的「全局」语义由 null 改为常量 'ALL'。
 *
 * schemeId 为空 = 临时停药，此时 startDate 必填（跟随方案组的语义只属于方案组条目，§7.4）。
 */
const BaseShape = {
  /** 空 = 临时停药 */
  schemeId: NullableTextSchema,
  /** 目标补剂，或 'ALL' 表示全部 */
  supplementId: z.string().min(1, '请选择要停用的补剂'),
  /** 空 = 跟随方案组 */
  startDate: IsoDateSchema.nullable(),
  /** 空 = 持续中 */
  endDate: IsoDateSchema.nullable(),
  reason: NullableTextSchema,
}

function checkDateOrder(data: { startDate?: string | null; endDate?: string | null }): boolean {
  if (data.endDate == null || data.startDate == null) return true
  return data.endDate >= data.startDate
}

function checkTemporaryStart(
  data: { schemeId?: string | null; startDate?: string | null },
  isCreate: boolean,
): boolean {
  if (data.schemeId != null) return true
  // Update 的部分更新：两者都没给就放行，交给 service 用合并后的完整对象再校验
  if (!isCreate && data.startDate === undefined && data.schemeId === undefined) return true
  return data.startDate != null
}

export const PausePeriodCreateSchema = z
  .object({
    id: UuidSchema,
    ...BaseShape,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .refine(checkDateOrder, { message: '结束日期不能早于开始日期' })
  .refine((d) => checkTemporaryStart(d, true), { message: '临时停药必须填写开始日期' })

export const PausePeriodUpdateSchema = z
  .object({
    schemeId: NullableTextSchema.optional(),
    supplementId: z.string().min(1).optional(),
    startDate: IsoDateSchema.nullable().optional(),
    endDate: IsoDateSchema.nullable().optional(),
    reason: NullableTextSchema.optional(),
    updatedAt: IsoDateTimeSchema.optional(),
  })
  .refine(checkDateOrder, { message: '结束日期不能早于开始日期' })
  .refine((d) => checkTemporaryStart(d, false), { message: '临时停药必须填写开始日期' })

export type PausePeriodCreateInput = z.infer<typeof PausePeriodCreateSchema>
export type PausePeriodUpdateInput = z.infer<typeof PausePeriodUpdateSchema>
