import { TO_MICROGRAM, type IngredientUnit } from '@/constants/units'

export type WeightUnit = 'μg' | 'mg' | 'g'

export function isWeightUnit(unit: IngredientUnit): unit is WeightUnit {
  return unit === 'μg' || unit === 'mg' || unit === 'g'
}

/** 重量类成分归一化到 μg */
export function toMicrogram(amount: number, unit: WeightUnit): number {
  return Math.round(amount * TO_MICROGRAM[unit])
}

/** 按合计后的数值选择展示单位（仅重量类） */
export function pickDisplayUnit(micrograms: number): { value: number; unit: WeightUnit } {
  const abs = Math.abs(micrograms)
  if (abs < 1000) return { value: micrograms, unit: 'μg' }
  if (abs < 1_000_000) return { value: micrograms / 1000, unit: 'mg' }
  return { value: micrograms / 1_000_000, unit: 'g' }
}

export function formatAmount(amount: number, unit: IngredientUnit): string {
  if (!isWeightUnit(unit)) return `${amount} ${unit}`
  return `${amount} ${unit}`
}
