import { db } from '@/db'
import { ingredientRepository, supplementIngredientRepository } from '@/repositories'
import { parseOrThrow } from '@/schemas/common'
import { IngredientCreateSchema, IngredientUpdateSchema } from '@/schemas/ingredient'
import type { IngredientUpdateInput } from '@/schemas/ingredient'
import { SupplementIngredientCreateSchema } from '@/schemas/supplementIngredient'
import type { Ingredient, SupplementIngredient } from '@/types'
import { publishDataChange } from '@/utils/broadcast'
import { addDays, today } from '@/utils/date'
import { newId, nowIso } from '@/utils/id'

/**
 * 成分与配方（实施指导书 §8.5 / T-303）。
 *
 * ★ 本文件唯一的难点是「改配方」：**不修改原记录**。
 *   原记录 `effectiveTo = 昨天`，另起一条 `effectiveFrom = 今天`。
 *   于是「回看 9/19 的汇总」永远按 9/19 那天生效的那条配方算，
 *   今天把含量翻倍不会让上个月的数字跟着变（§8.5「回看历史」）。
 *
 * 系统不预置任何默认阈值：参考摄入量与上限全由用户填，留空即「不比较」。
 */

export interface IngredientDraft {
  name: string
  unit: Ingredient['unit']
  recommendedDailyIntake: number | null
  upperLimit: number | null
  notes: string | null
}

export async function listIngredients(): Promise<Ingredient[]> {
  const rows = await ingredientRepository.all()
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
}

export async function createIngredient(draft: IngredientDraft): Promise<Ingredient> {
  const now = nowIso()
  const record = parseOrThrow(IngredientCreateSchema, {
    id: newId(),
    ...draft,
    createdAt: now,
    updatedAt: now,
  })
  await ingredientRepository.insert(record)
  publishDataChange()
  return record
}

export async function updateIngredient(id: string, draft: IngredientDraft): Promise<void> {
  if (!(await db.ingredients.get(id))) throw new Error('成分不存在')
  const patch: IngredientUpdateInput = { ...draft }
  await ingredientRepository.update(id, parseOrThrow(IngredientUpdateSchema, patch))
  publishDataChange()
}

/** W-08 的命名提示要用：已有几个补剂关联此成分 */
export async function countLinks(ingredientId: string): Promise<number> {
  const rows = await db.supplementIngredients.where('ingredientId').equals(ingredientId).toArray()
  return rows.length
}

export interface IngredientSourceRow {
  link: SupplementIngredient
  supplementName: string
  /** effectiveTo 为空 = 当前有效 */
  isCurrent: boolean
}

/** 来源追溯：这个成分被哪些补剂包含（含已失效配方 —— 用户需要看到「改过配方」） */
export async function listSources(ingredientId: string): Promise<IngredientSourceRow[]> {
  const [links, supplements] = await Promise.all([
    db.supplementIngredients.where('ingredientId').equals(ingredientId).toArray(),
    db.supplements.toArray(),
  ])
  const names = new Map(supplements.map((s) => [s.id, s.name]))

  return links
    .map((link) => ({
      link,
      supplementName: names.get(link.supplementId) ?? '[已删除的补剂]',
      isCurrent: link.effectiveTo == null,
    }))
    .sort((a, b) => b.link.effectiveFrom.localeCompare(a.link.effectiveFrom))
}

/** 某个补剂当前的配方（含已失效行，UI 要降饱和显示） */
export async function listLinksBySupplement(supplementId: string): Promise<SupplementIngredient[]> {
  const rows = await supplementIngredientRepository.listBySupplement(supplementId)
  return rows.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
}

/** 新增一条配方：即刻生效（effectiveFrom = 今天） */
export async function addLink(input: {
  supplementId: string
  ingredientId: string
  amountPerServing: number
}): Promise<SupplementIngredient> {
  const now = nowIso()
  const record = parseOrThrow(SupplementIngredientCreateSchema, {
    id: newId(),
    supplementId: input.supplementId,
    ingredientId: input.ingredientId,
    amountPerServing: input.amountPerServing,
    effectiveFrom: today(),
    effectiveTo: null,
    createdAt: now,
    updatedAt: now,
  })
  await supplementIngredientRepository.insert(record)
  publishDataChange()
  return record
}

/**
 * 改配方。
 *
 * - 该配方**已经生效过**（effectiveFrom 在过去）→ 留痕：原记录 `effectiveTo = 昨天`，
 *   新建一条 `effectiveFrom = 今天`。历史汇总因此不受影响。
 * - 该配方**今天才建的**（effectiveFrom >= 今天）→ 它还没参与过任何一天的数字，
 *   直接在原记录上改，不留一条「今天起、今天止」的空区间
 *   （那会踩到 `失效日期不能早于生效日期` 的 schema 约束）。
 */
export async function changeRecipe(linkId: string, amountPerServing: number): Promise<void> {
  const now = nowIso()
  const link = await db.supplementIngredients.get(linkId)
  if (!link) throw new Error('配方不存在')

  const currentDay = today()

  if (link.effectiveFrom >= currentDay) {
    await db.supplementIngredients.update(linkId, { amountPerServing, updatedAt: now })
    publishDataChange()
    return
  }

  if (link.effectiveTo != null) {
    throw new Error('已失效的配方不能再改，请在下方新增一条')
  }

  const record = parseOrThrow(SupplementIngredientCreateSchema, {
    id: newId(),
    supplementId: link.supplementId,
    ingredientId: link.ingredientId,
    amountPerServing,
    effectiveFrom: currentDay,
    effectiveTo: null,
    createdAt: now,
    updatedAt: now,
  })

  await db.transaction('rw', db.supplementIngredients, async () => {
    await db.supplementIngredients.update(linkId, {
      effectiveTo: addDays(currentDay, -1),
      updatedAt: now,
    })
    await db.supplementIngredients.add(record)
  })

  publishDataChange()
}

/**
 * 删除一条配方。
 *
 * 这是「填错了」的修正，不是「改配方」——所以是硬删除（和计划被直接编辑一样）。
 * 需要保留历史的场景走 changeRecipe。
 */
export async function removeLink(linkId: string): Promise<void> {
  await db.supplementIngredients.delete(linkId)
  publishDataChange()
}
