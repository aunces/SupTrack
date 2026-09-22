import type { IngredientUnit } from '@/constants/units'
import type { DailyIntake, Ingredient, Supplement, SupplementIngredient } from '@/types'
import { isWeightUnit, pickDisplayUnit, toMicrogram } from './unit'

/**
 * 成分汇总（实施指导书 §6.6）★ 纯函数。
 *
 * 四条口径**逐条写死在这里**，不接受调用方开关（需求 §6.9）：
 *   1. 只统计 `record.taken === true` —— 标了漏服的记录不计入
 *   2. 按**服用归属日**当时有效的配方算（不是 createdAt）
 *   3. 重量类（μg / mg / g）归一到 μg 再累加；IU 与 ml **各自独立累加**，互不相加
 *   4. 输出只有数字与并列 —— 不产生任何「超标 / 过量 / 建议」字段，颜色与图标由 UI 层禁止
 *
 * 口径 4 是产品合规红线（R-02）：本文件里**不允许**出现 level / status / overLimit /
 * warning 之类的字段名，一个都不行。测试会断言这些名字不存在。
 */

export interface IngredientTotal {
  ingredientId: string
  name: string
  unit: IngredientUnit
  /** 重量类为 μg 合计数；IU / ml 为原单位合计数 */
  total: number
  /** 展示用（重量类按合计值选单位） */
  displayValue: number
  displayUnit: IngredientUnit
  recommendedDailyIntake: number | null
  upperLimit: number | null
  /** 来源明细（UI 展示「来源：A 1000 + B 400」） */
  sources: Array<{ supplementId: string; supplementName: string; amount: number }>
  /** 存在解析不出补剂的记录 */
  hasDeletedSupplement: boolean
  /** 存在关联配方缺失 */
  missingRecipe: boolean
}

export interface SummaryInput {
  /** 该日的记录（函数内部自己按口径 1 过滤，调用方不必先过滤） */
  records: DailyIntake[]
  ingredients: Map<string, Ingredient>
  supplements: Map<string, Supplement>
  /** 该日每条记录的补剂 → 当时有效的配方关联（口径 2 由调用方按 date 查好后传入） */
  linksBySupplement: Map<string, SupplementIngredient[]>
}

/**
 * 累加键：`ingredientId:单位类别`。
 * 正常情况下一个成分只有一个单位，键退化为 ingredientId；
 * 加上单位类别是为了兜住「成分单位被从 mg 改成 IU」的历史数据 ——
 * 那时旧关联与新关联绝不能加在一起（口径 3）。
 */
function accKey(ingredientId: string, unit: IngredientUnit): string {
  if (isWeightUnit(unit)) return `${ingredientId}:weight`
  return `${ingredientId}:${unit}`
}

interface Accumulator {
  ingredient: Ingredient
  /** 重量类存 μg；IU / ml 存原单位 */
  total: number
  /** supplementId → 该补剂贡献的量（原单位） */
  sourceAmounts: Map<string, number>
}

export function computeIngredientTotals(input: SummaryInput): IngredientTotal[] {
  const { records, ingredients, supplements, linksBySupplement } = input

  const accumulators = new Map<string, Accumulator>()
  let hasDeletedSupplement = false
  let missingRecipe = false

  for (const record of records) {
    // 口径 1：漏服不产出任何数字。补一条 taken=false 不该让「今日摄入」变多。
    if (!record.taken) continue

    const supplement = supplements.get(record.supplementId)
    // 补剂已被删除 → 与「压根没配成分」是两件事，分开记
    if (!supplement) hasDeletedSupplement = true

    const links = linksBySupplement.get(record.supplementId) ?? []
    if (links.length === 0) {
      if (supplement) missingRecipe = true
      continue
    }

    for (const link of links) {
      const ingredient = ingredients.get(link.ingredientId)
      // 关联指向的成分不存在（导入了一份残缺备份）→ 跳过，不让它污染数字
      if (!ingredient) {
        missingRecipe = true
        continue
      }

      const contributed = link.amountPerServing * record.amount
      const key = accKey(ingredient.id, ingredient.unit)

      let acc = accumulators.get(key)
      if (!acc) {
        acc = { ingredient, total: 0, sourceAmounts: new Map() }
        accumulators.set(key, acc)
      }

      // 口径 3：重量类归一到 μg；IU / ml 原样累加
      acc.total += isWeightUnit(ingredient.unit)
        ? toMicrogram(contributed, ingredient.unit)
        : contributed
      acc.sourceAmounts.set(
        record.supplementId,
        (acc.sourceAmounts.get(record.supplementId) ?? 0) + contributed,
      )
    }
  }

  const totals: IngredientTotal[] = []
  for (const acc of accumulators.values()) {
    const { ingredient } = acc
    // 口径 3 的展示侧：重量类按合计值选单位（<1000μg → μg；<1e6 → mg；否则 g）
    const display = isWeightUnit(ingredient.unit)
      ? pickDisplayUnit(acc.total)
      : { value: acc.total, unit: ingredient.unit }

    const sources = [...acc.sourceAmounts.entries()].map(([supplementId, amount]) => ({
      supplementId,
      supplementName: supplements.get(supplementId)?.name ?? '[已删除的补剂]',
      amount,
    }))

    totals.push({
      ingredientId: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      total: acc.total,
      displayValue: display.value,
      displayUnit: display.unit,
      // 参考值与上限只做**并列展示**，不做任何比较（口径 4）
      recommendedDailyIntake: ingredient.recommendedDailyIntake,
      upperLimit: ingredient.upperLimit,
      sources,
      hasDeletedSupplement,
      missingRecipe,
    })
  }

  // 排序只按名称：按数值排会让「今天第一行」随数字跳动，且暗示了大小关系
  return totals.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
}
