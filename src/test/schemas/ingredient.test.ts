import { describe, expect, it } from 'vitest'
import { IngredientCreateSchema } from '@/schemas/ingredient'

const base = {
  id: 'ing-1',
  name: '维生素 D',
  unit: 'mcg',
  recommendedDailyIntake: 20,
  upperLimit: 100,
  description: null,
  deletedAt: 0,
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

  it('推荐量与上限必须是整数', () => {
    expect(IngredientCreateSchema.safeParse({ ...base, recommendedDailyIntake: 0.5 }).success).toBe(
      false,
    )
    expect(IngredientCreateSchema.safeParse({ ...base, upperLimit: 1.5 }).success).toBe(false)
  })
})
