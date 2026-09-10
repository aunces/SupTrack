import { db } from '@/db'
import { dailyIntakeRepository, supplementIngredientRepository } from '@/repositories'
import type { DailyIntake, Ingredient, IngredientUnit } from '@/types'
import { isWeightUnit, pickDisplayUnit, toMicrogram } from '@/utils/unit'

export interface IngredientSource {
  supplementId: string
  supplementName: string
  amount: number
  isDeleted: boolean
}

export interface IngredientTotal {
  ingredientId: string
  name: string
  unit: IngredientUnit
  /** 重量类为 μg 合计数；IU / ml 为原单位合计数 */
  total: number
  displayValue: number
  displayUnit: IngredientUnit
  recommendedDailyIntake?: number | null
  upperLimit?: number | null
  /** 含已软删除补剂的记录 */
  hasDeletedSupplement: boolean
  /** 关联配方缺失，无法计算 */
  missingData: boolean
  sources: IngredientSource[]
}

/**
 * 按日期汇总成分摄入（需求 5.4）：
 * - 仅统计 deletedAt === 0 的 DailyIntake
 * - 按 date 匹配当时有效配方（includeDeleted = true）
 * - 重量类归一化到 μg；IU / ml 独立累加
 * - 孤儿记录（补剂已软删除）仍计入并标注
 */
export async function summarizeDate(date: string): Promise<IngredientTotal[]> {
  const intakes = await dailyIntakeRepository.listByDate(date)
  return summarize(intakes)
}

export async function summarizeRange(
  startDate: string,
  endDate: string,
): Promise<IngredientTotal[]> {
  const intakes = await dailyIntakeRepository.listByDateRange(startDate, endDate)
  return summarize(intakes)
}

async function summarize(intakes: DailyIntake[]): Promise<IngredientTotal[]> {
  const accumulator = new Map<string, IngredientTotal>()

  for (const intake of intakes) {
    if (intake.deletedAt !== 0) continue
    if (intake.status === 'skipped') continue

    const supplement = await db.supplements.get(intake.supplementId)
    const links = await supplementIngredientRepository.effectiveAt(
      intake.supplementId,
      intake.date,
      true,
    )

    if (links.length === 0) continue

    for (const link of links) {
      const ingredient = await db.ingredients.get(link.ingredientId)
      if (!ingredient) continue

      const amount = link.amountPerServing * intake.actualAmount
      const key = `${ingredient.id}:${ingredient.unit}`
      const current = accumulator.get(key) ?? createTotal(ingredient)

      if (isWeightUnit(ingredient.unit)) {
        current.total += toMicrogram(amount, ingredient.unit)
      } else {
        current.total += amount
      }
      const isDeleted = !supplement || supplement.deletedAt !== 0
      current.hasDeletedSupplement = current.hasDeletedSupplement || isDeleted
      current.sources.push({
        supplementId: intake.supplementId,
        supplementName: isDeleted ? '[已删除的补剂]' : (supplement?.name ?? ''),
        amount,
        isDeleted,
      })
      accumulator.set(key, current)
    }
  }

  return [...accumulator.values()].map((total) => {
    if (isWeightUnit(total.unit)) {
      const display = pickDisplayUnit(total.total)
      return { ...total, displayValue: display.value, displayUnit: display.unit }
    }
    return { ...total, displayValue: total.total, displayUnit: total.unit }
  })
}

function createTotal(ingredient: Ingredient): IngredientTotal {
  return {
    ingredientId: ingredient.id,
    name: ingredient.name,
    unit: ingredient.unit,
    total: 0,
    displayValue: 0,
    displayUnit: ingredient.unit,
    recommendedDailyIntake: ingredient.recommendedDailyIntake,
    upperLimit: ingredient.upperLimit,
    hasDeletedSupplement: false,
    missingData: false,
    sources: [],
  }
}
