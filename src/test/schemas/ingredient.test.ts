import { describe, expect, it } from 'vitest'
import { IngredientCreateSchema } from '@/schemas/ingredient'

const now = new Date().toISOString()

const base = {
  id: crypto.randomUUID(),
  name: '维生素 D3',
  unit: 'mcg',
  recommendedDailyIntake: 20,
  upperLimit: 100,
  notes: null,
  createdAt: now,
  updatedAt: now,
}

describe('IngredientCreateSchema', () => {
  it('输入 mcg 自动转为 μg', () => {
    const result = IngredientCreateSchema.safeParse(base)
    expect(result.success).toBe(true)
    expect(result.success && result.data.unit).toBe('μg')
  })

  it('大小写不敏感', () => {
    const result = IngredientCreateSchema.safeParse({ ...base, unit: 'MCG' })
    expect(result.success && result.data.unit).toBe('μg')
  })

  it('μg / mg / g / IU / ml 原样保留', () => {
    for (const unit of ['μg', 'mg', 'g', 'IU', 'ml']) {
      const result = IngredientCreateSchema.safeParse({ ...base, unit })
      expect(result.success && result.data.unit).toBe(unit)
    }
  })

  it('非法单位被拒', () => {
    expect(IngredientCreateSchema.safeParse({ ...base, unit: 'kg' }).success).toBe(false)
  })

  it('参考摄入量与上限留空合法（系统不预置默认阈值）', () => {
    expect(
      IngredientCreateSchema.safeParse({
        ...base,
        recommendedDailyIntake: null,
        upperLimit: null,
      }).success,
    ).toBe(true)
  })

  it('参考摄入量与上限必须是整数且非负', () => {
    expect(IngredientCreateSchema.safeParse({ ...base, recommendedDailyIntake: 0.5 }).success).toBe(
      false,
    )
    expect(IngredientCreateSchema.safeParse({ ...base, upperLimit: 1.5 }).success).toBe(false)
    expect(IngredientCreateSchema.safeParse({ ...base, recommendedDailyIntake: -1 }).success).toBe(
      false,
    )
    expect(IngredientCreateSchema.safeParse({ ...base, upperLimit: -1 }).success).toBe(false)
    expect(IngredientCreateSchema.safeParse({ ...base, recommendedDailyIntake: 0 }).success).toBe(
      true,
    )
  })

  it('名称为空被拒', () => {
    expect(IngredientCreateSchema.safeParse({ ...base, name: '' }).success).toBe(false)
  })
})
