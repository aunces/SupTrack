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
 *   4. 输出对象里**没有**任何结论性字段（level / status / warning 之类）—— 数据层不下结论；
 *      唯一的例外是文件末尾的 `exceedsUpperLimit()`：一个供 UI 标红用的纯比较函数，
 *      它不写进输出对象、不产出任何文案。
 *
 * 口径 4 是产品合规红线（R-02）。用户于 2026-09-22 裁决：一览改为由**用户自己配置的上限**
 * 驱动标红（见 docs/DECISIONS.md D-43），因此这里放行一个显式的比较函数。
 * 其余红线**依旧禁止**：进度条着色、告警图标、健康评分，以及任何
 * 「超标 / 过量 / 有害 / 建议减少」措辞。测试逐字断言这些名字不存在。
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

/**
 * 今日合计是否已高于用户自配的上限（D-43）。
 *
 * ★ 这是本项目里**唯一**一处「替用户做比较」的地方，是 2026-09-22 用户明确裁决的结果
 *   （原口径按 §6.6 禁止「超限变红」）。它只是一次纯比较，不产生文案、不写进输出对象。
 *
 * 为什么必须放在这里而不是组件里：`upperLimit` 是用户按**成分自己的单位**填的（例如 40 mg），
 * 而 `total` 在重量类下已被归一到 μg。直接比大小会在「上限填 mg、合计展示 g」时算错，
 * 这个换算只应该有一份实现。
 *
 * 边界：**相等不算超过**（合计 40 mg、上限 40 mg → 不标红）。
 * 没设上限（null）永远不标红 —— 系统不预置任何默认阈值。
 */
export function exceedsUpperLimit(total: IngredientTotal): boolean {
  if (total.upperLimit == null) return false
  const limit = isWeightUnit(total.unit)
    ? toMicrogram(total.upperLimit, total.unit)
    : total.upperLimit
  return total.total > limit
}
