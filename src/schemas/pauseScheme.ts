import { z } from 'zod'
import { PAUSE_CYCLE_MODE, PAUSE_CYCLE_MODE_VALUES, type PauseCycleMode } from '@/constants/enums'
import {
  IsoDateSchema,
  IsoDateTimeSchema,
  NullableIntSchema,
  NullableTextSchema,
  UuidSchema,
} from './common'

/**
 * 停药方案组（实施指导书 §5.2 / §5.5，新增于 M1 建表、M2 出界面、M2+ 加周期）。
 * 「同一时刻至多一组执行中」由 pauseService.activateScheme 保证，不在 schema 里表达
 * （schema 只能看到单条记录，看不到集合约束）。
 *
 * ★ 周期字段（D-44，用户 2026-09-22 裁决）：方案组可以是「连续」或「周期（吃 N 停 M）」。
 *   周期起点**复用 `activatedAt`**（执行日 = 周期第 1 天），不另开字段。
 *   三个字段都带 `.default()`：读旧数据 / 导入旧备份时自动落回「连续」，**不需要迁移**。
 */
const BaseShape = {
  name: z.string().min(1, '请填写方案名称'),
  note: NullableTextSchema,
  /** 是否执行中 */
  isActive: z.boolean(),
  /** 执行起始日；周期模式下同时是周期第 1 天 */
  activatedAt: IsoDateSchema.nullable(),
  /** 结束日；空且 isActive = 持续中 */
  endedAt: IsoDateSchema.nullable(),
  cycleMode: z.enum(PAUSE_CYCLE_MODE_VALUES).default(PAUSE_CYCLE_MODE.CONTINUOUS),
  cycleOnDays: NullableIntSchema.default(null),
  cycleOffDays: NullableIntSchema.default(null),
}

function checkDateOrder(data: { activatedAt?: string | null; endedAt?: string | null }): boolean {
  if (data.endedAt == null || data.activatedAt == null) return true
  return data.endedAt >= data.activatedAt
}

/** 周期模式必须补齐「吃几天 / 停几天」。起点复用执行日，所以不在这里校验起点 */
function checkCycle(data: {
  cycleMode?: PauseCycleMode
  cycleOnDays?: number | null
  cycleOffDays?: number | null
}): boolean {
  if (data.cycleMode !== PAUSE_CYCLE_MODE.CYCLIC) return true
  const on = data.cycleOnDays
  const off = data.cycleOffDays
  return on != null && on >= 1 && off != null && off >= 1
}

const CYCLE_MESSAGE = '周期方案必须填写「吃几天 / 停几天」'

export const PauseSchemeCreateSchema = z
  .object({
    id: UuidSchema,
    ...BaseShape,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .refine(checkDateOrder, { message: '结束日期不能早于执行日期' })
  .refine(checkCycle, { message: CYCLE_MESSAGE })

export const PauseSchemeUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    note: NullableTextSchema.optional(),
    isActive: z.boolean().optional(),
    activatedAt: IsoDateSchema.nullable().optional(),
    endedAt: IsoDateSchema.nullable().optional(),
    cycleMode: z.enum(PAUSE_CYCLE_MODE_VALUES).optional(),
    cycleOnDays: NullableIntSchema.optional(),
    cycleOffDays: NullableIntSchema.optional(),
    updatedAt: IsoDateTimeSchema.optional(),
  })
  .refine(checkDateOrder, { message: '结束日期不能早于执行日期' })
  .refine(
    // 部分更新时只在显式改 cycleMode 的情况下校验，避免误报（与 dosagePlan 同一处理）
    (d) => (d.cycleMode === undefined ? true : checkCycle({ ...d, cycleMode: d.cycleMode })),
    { message: CYCLE_MESSAGE },
  )

export type PauseSchemeCreateInput = z.infer<typeof PauseSchemeCreateSchema>
export type PauseSchemeUpdateInput = z.infer<typeof PauseSchemeUpdateSchema>
