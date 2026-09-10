import { describe, expect, it } from 'vitest'
import { SupplementCreateSchema } from '@/schemas/supplement'

const now = new Date().toISOString()

const base = {
  id: crypto.randomUUID(),
  name: '鱼油',
  brand: null,
  description: null,
  unitType: 'capsule',
  stockCountInUsageUnit: 90,
  stockUnit: null,
  unitsPerStock: null,
  productionDate: null,
  expiryDate: null,
  status: 'active',
  deletedAt: 0,
  createdAt: now,
  updatedAt: now,
}

describe('SupplementCreateSchema', () => {
  it('不填库存单位时合法', () => {
    expect(SupplementCreateSchema.safeParse(base).success).toBe(true)
  })

  it('填了库存单位与换算率时合法', () => {
    expect(
      SupplementCreateSchema.safeParse({ ...base, stockUnit: '瓶', unitsPerStock: 60 }).success,
    ).toBe(true)
  })

  it('填了库存单位但缺换算率时被拒', () => {
    expect(SupplementCreateSchema.safeParse({ ...base, stockUnit: '瓶' }).success).toBe(false)
  })

  it('库存单位与服用单位相同时可不填换算率', () => {
    expect(SupplementCreateSchema.safeParse({ ...base, stockUnit: 'capsule' }).success).toBe(true)
  })

  it('库存允许为负且必须为整数', () => {
    expect(SupplementCreateSchema.safeParse({ ...base, stockCountInUsageUnit: -3 }).success).toBe(
      true,
    )
    expect(SupplementCreateSchema.safeParse({ ...base, stockCountInUsageUnit: 1.5 }).success).toBe(
      false,
    )
  })
})
