import {
  dailyIntakeRepository,
  dosagePlanRepository,
  ingredientRepository,
  pausePeriodRepository,
  pauseSchemeRepository,
  supplementIngredientRepository,
  supplementRepository,
} from '@/repositories'
import type { SupplementIngredient } from '@/types'
import {
  computeIngredientTotals,
  computePlannedIngredientTotals,
  type IngredientTotal,
} from '@/utils/summary'

/**
 * 成分汇总用例（实施指导书 §6.6 / T-302）。
 *
 * 本文件只负责**取材**：按日期取出记录、成分、以及「那天当时有效的配方」，
 * 然后把四条口径交给 utils/summary 的纯函数。判定一行都不写在这里，
 * 所以「只算 taken=true」「按当时配方」这些规则能被单独钉死测试。
 *
 * ★ 旧实现在这里做过「超过上限就标红」—— M3 重写时必须删掉（R-02 / RK-05）。
 *   上限只是与总量并列展示的另一个数字，工具不替用户下结论。
 */

export type { IngredientTotal }

export async function summarizeDate(date: string): Promise<IngredientTotal[]> {
  const records = await dailyIntakeRepository.listByDate(date)
  if (records.length === 0) return []

  const [ingredients, supplements] = await Promise.all([
    ingredientRepository.all(),
    supplementRepository.all(),
  ])

  // 口径 2：按 record.date 当天有效的配方，而不是「现在有效的配方」。
  // 所以这里必须逐补剂查 effectiveAt(date) —— 改过配方的补剂会同时命中新旧两条，
  // 但只有区间覆盖该日的那条能查到。
  const supplementIds = [...new Set(records.map((record) => record.supplementId))]
  const linksBySupplement = new Map<string, SupplementIngredient[]>()
  await Promise.all(
    supplementIds.map(async (supplementId) => {
      linksBySupplement.set(
        supplementId,
        await supplementIngredientRepository.effectiveAt(supplementId, date),
      )
    }),
  )

  return computeIngredientTotals({
    records,
    ingredients: new Map(ingredients.map((item) => [item.id, item])),
    supplements: new Map(supplements.map((item) => [item.id, item])),
    linksBySupplement,
  })
}

/**
 * 每日成分汇总（计划口径，2026-09-22）。
 *
 * 只取材：取「启用计划 + 当日配方」，判定与累加全交给 utils/summary 的纯函数。
 * **不读打卡记录** —— 与 summarizeDate（实际口径）的区别就在这里：
 * 这里统计的是「今天按计划该摄入多少」，而非「今天实际吃了多少」。
 */
export async function summarizePlannedDate(date: string): Promise<IngredientTotal[]> {
  const plans = await dosagePlanRepository.listActive()
  if (plans.length === 0) return []

  const [ingredients, supplements, periods, schemes] = await Promise.all([
    ingredientRepository.all(),
    supplementRepository.all(),
    pausePeriodRepository.all(),
    pauseSchemeRepository.all(),
  ])

  const supplementIds = [...new Set(plans.map((plan) => plan.supplementId))]
  const linksBySupplement = new Map<string, SupplementIngredient[]>()
  await Promise.all(
    supplementIds.map(async (supplementId) => {
      linksBySupplement.set(
        supplementId,
        await supplementIngredientRepository.effectiveAt(supplementId, date),
      )
    }),
  )

  return computePlannedIngredientTotals({
    date,
    plans,
    ingredients: new Map(ingredients.map((item) => [item.id, item])),
    supplements: new Map(supplements.map((item) => [item.id, item])),
    pauseCtx: { periods, schemes: new Map(schemes.map((item) => [item.id, item])) },
    linksBySupplement,
  })
}
