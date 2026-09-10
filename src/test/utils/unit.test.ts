import { describe, expect, it } from 'vitest'
import { isWeightUnit, pickDisplayUnit, toMicrogram } from '@/utils/unit'

describe('单位换算', () => {
  it('归一化到 μg', () => {
    expect(toMicrogram(1, 'μg')).toBe(1)
    expect(toMicrogram(1, 'mg')).toBe(1000)
    expect(toMicrogram(1, 'g')).toBe(1_000_000)
    expect(toMicrogram(500, 'mg')).toBe(500_000)
  })

  it('按合计值选择展示单位', () => {
    expect(pickDisplayUnit(500)).toEqual({ value: 500, unit: 'μg' })
    expect(pickDisplayUnit(1500)).toEqual({ value: 1.5, unit: 'mg' })
    expect(pickDisplayUnit(2_000_000)).toEqual({ value: 2, unit: 'g' })
  })

  it('IU / ml 不属于重量类', () => {
    expect(isWeightUnit('IU')).toBe(false)
    expect(isWeightUnit('ml')).toBe(false)
    expect(isWeightUnit('mg')).toBe(true)
  })
})
