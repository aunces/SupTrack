import { z } from 'zod'
import { SUPPLEMENT_STATUS_VALUES } from '@/constants/enums'
import { UNIT_TYPE_VALUES, type UnitType } from '@/constants/units'
import {
  DeletedAtSchema,
  IsoDateTimeSchema,
  OptionalNullableDateSchema,
  OptionalNullableIntSchema,
  OptionalNullableTextSchema,
  UuidSchema,
} from './common'

const BaseShape = {
  name: z.string().min(1, '请填写补剂名称'),
  brand: OptionalNullableTextSchema,
  description: OptionalNullableTextSchema,
  unitType: z.enum(UNIT_TYPE_VALUES),
  stockCountInUsageUnit: OptionalNullableIntSchema,
  stockUnit: OptionalNullableTextSchema,
  unitsPerStock: OptionalNullableIntSchema,
  productionDate: OptionalNullableDateSchema,
  expiryDate: OptionalNullableDateSchema,
  status: z.enum(SUPPLEMENT_STATUS_VALUES),
}

/** 库存单位换算：填了非服用单位的库存单位就必须填换算率 */
function checkStockUnit(data: {
  unitType: UnitType
  stockUnit?: string | null
  unitsPerStock?: number | null
}) {
  if (data.stockUnit != null && data.stockUnit !== data.unitType && data.unitsPerStock == null) {
    return false
  }
  return true
}

export const SupplementCreateSchema = z
  .object({
    id: UuidSchema,
    ...BaseShape,
    deletedAt: DeletedAtSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .refine(checkStockUnit, '填写了库存展示单位时，必须填写换算率：1 个展示单位等于多少服用单位')

export const SupplementUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    brand: OptionalNullableTextSchema,
    description: OptionalNullableTextSchema,
    unitType: z.enum(UNIT_TYPE_VALUES).optional(),
    stockCountInUsageUnit: OptionalNullableIntSchema,
    stockUnit: OptionalNullableTextSchema,
    unitsPerStock: OptionalNullableIntSchema,
    productionDate: OptionalNullableDateSchema,
    expiryDate: OptionalNullableDateSchema,
    status: z.enum(SUPPLEMENT_STATUS_VALUES).optional(),
    deletedAt: DeletedAtSchema.optional(),
    updatedAt: IsoDateTimeSchema.optional(),
  })
  .refine(
    (d) =>
      d.unitType === undefined && d.stockUnit === undefined && d.unitsPerStock === undefined
        ? true
        : checkStockUnit({
            unitType: (d.unitType ?? 'capsule') as UnitType,
            stockUnit: d.stockUnit,
            unitsPerStock: d.unitsPerStock,
          }),
    '填写了库存展示单位时，必须填写换算率：1 个展示单位等于多少服用单位',
  )

export type SupplementCreateInput = z.infer<typeof SupplementCreateSchema>
export type SupplementUpdateInput = z.infer<typeof SupplementUpdateSchema>
