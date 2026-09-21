import { describe, expect, it } from 'vitest'
import {
  SupplementIngredientCreateSchema,
  SupplementIngredientUpdateSchema,
} from '@/schemas/supplementIngredient'

const now = new Date().toISOString()

const base = {
  id: crypto.randomUUID(),
  supplementId: 'supp-1',
  ingredientId: 'ing-1',
  amountPerServing: 1000,
  effectiveFrom: '2026-09-15',
  effectiveTo: null,
  createdAt: now,
  updatedAt: now,
}

describe('SupplementIngredientCreateSchema', () => {
  it('当前有效（失效日为空）合法', () => {
    expect(SupplementIngredientCreateSchema.safeParse(base).success).toBe(true)
  })

  it('每份含量为 0 合法，为负被拒', () => {
    expect(
      SupplementIngredientCreateSchema.safeParse({ ...base, amountPerServing: 0 }).success,
    ).toBe(true)
    expect(
      SupplementIngredientCreateSchema.safeParse({ ...base, amountPerServing: -1 }).success,
    ).toBe(false)
  })

  it('每份含量必须是整数', () => {
    expect(
      SupplementIngredientCreateSchema.safeParse({ ...base, amountPerServing: 0.5 }).success,
    ).toBe(false)
  })

  it('失效日早于生效日被拒', () => {
    const result = SupplementIngredientCreateSchema.safeParse({
      ...base,
      effectiveTo: '2026-09-14',
    })
    expect(result.success).toBe(false)
    expect(result.success === false && JSON.stringify(result.error.issues)).toContain(
      '失效日期不能早于生效日期',
    )
  })
})

describe('SupplementIngredientUpdateSchema', () => {
  it('只改含量合法', () => {
    expect(SupplementIngredientUpdateSchema.safeParse({ amountPerServing: 400 }).success).toBe(true)
  })

  it('同时给生效与失效且顺序颠倒被拒', () => {
    expect(
      SupplementIngredientUpdateSchema.safeParse({
        effectiveFrom: '2026-09-20',
        effectiveTo: '2026-09-19',
      }).success,
    ).toBe(false)
  })
})
