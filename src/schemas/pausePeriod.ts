import { z } from 'zod'
import { CYCLE_MODE, CYCLE_MODE_VALUES } from '@/constants/enums'
import {
  DeletedAtSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  NullableTextSchema,
  OptionalNullableDateSchema,
  OptionalNullableIntSchema,
  OptionalNullableTextSchema,
  UuidSchema,
} from './common'

const BaseShape = {
  supplementId: NullableTextSchema,
  startDate: IsoDateSchema,
  endDate: OptionalNullableDateSchema,
  reason: OptionalNullableTextSchema,
  cycleMode: z.enum(CYCLE_MODE_VALUES),
  cycleStartDate: OptionalNullableDateSchema,
  cycleOnDays: OptionalNullableIntSchema,
  cycleOffDays: OptionalNullableIntSchema,
}

function checkPeriod(data: {
  cycleMode: string
  cycleStartDate?: string | null
  cycleOnDays?: number | null
  cycleOffDays?: number | null
  endDate?: string | null
  startDate?: string
}) {
  if (data.endDate != null && data.startDate != null && data.endDate < data.startDate) return false
  if (data.cycleMode === CYCLE_MODE.CYCLIC) {
    return (
      data.cycleStartDate != null &&
      data.cycleOnDays != null &&
      data.cycleOffDays != null &&
      data.cycleOnDays > 0 &&
      data.cycleOffDays > 0
    )
  }
  return data.cycleStartDate == null
}

export const PausePeriodCreateSchema = z
  .object({
    id: UuidSchema,
    ...BaseShape,
    deletedAt: DeletedAtSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .refine(checkPeriod, {
    message:
      '周期模式必须填写周期锚点与吃/停天数；非周期模式不得填写周期锚点；结束日期不得早于开始日期',
  })

export const PausePeriodUpdateSchema = z
  .object({
    supplementId: NullableTextSchema.optional(),
    startDate: IsoDateSchema.optional(),
    endDate: OptionalNullableDateSchema,
    reason: OptionalNullableTextSchema.optional(),
    cycleMode: z.enum(CYCLE_MODE_VALUES).optional(),
    cycleStartDate: OptionalNullableDateSchema,
    cycleOnDays: OptionalNullableIntSchema,
    cycleOffDays: OptionalNullableIntSchema,
    deletedAt: DeletedAtSchema.optional(),
    updatedAt: IsoDateTimeSchema.optional(),
  })
  .refine(
    (d) =>
      d.cycleMode === undefined && d.cycleStartDate === undefined
        ? true
        : checkPeriod({
            cycleMode: d.cycleMode ?? CYCLE_MODE.NONE,
            cycleStartDate: d.cycleStartDate,
            cycleOnDays: d.cycleOnDays,
            cycleOffDays: d.cycleOffDays,
            startDate: d.startDate,
            endDate: d.endDate,
          }),
    {
      message:
        '周期模式必须填写周期锚点与吃/停天数；非周期模式不得填写周期锚点；结束日期不得早于开始日期',
    },
  )

export type PausePeriodCreateInput = z.infer<typeof PausePeriodCreateSchema>
export type PausePeriodUpdateInput = z.infer<typeof PausePeriodUpdateSchema>
