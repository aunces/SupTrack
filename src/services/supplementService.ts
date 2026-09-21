import { db } from '@/db'
import {
  dailyIntakeRepository,
  dosagePlanRepository,
  pausePeriodRepository,
  supplementIngredientRepository,
  supplementRepository,
} from '@/repositories'
import { parseOrThrow } from '@/schemas/common'
import { DosagePlanCreateSchema } from '@/schemas/dosagePlan'
import { SupplementCreateSchema, SupplementUpdateSchema } from '@/schemas/supplement'
import type { SupplementCreateInput, SupplementUpdateInput } from '@/schemas/supplement'
import type { Supplement } from '@/types'
import { publishDataChange } from '@/utils/broadcast'
import { newId, nowIso } from '@/utils/id'
import { buildPlanRecord, type PlanDraftInput } from './planService'

/**
 * 补剂用例（实施指导书 §7.1）。
 *
 * 系统字段（id / createdAt / updatedAt）由 service 生成，页面只给业务字段。
 */

export type SupplementDraft = Omit<SupplementCreateInput, 'id' | 'createdAt' | 'updatedAt'>

/** 新建补剂（可选同时创建首条计划，减少一次跳转） */
export async function createSupplement(
  input: SupplementDraft,
  plan?: PlanDraftInput,
): Promise<Supplement> {
  const now = nowIso()
  const record = parseOrThrow(SupplementCreateSchema, {
    ...input,
    id: newId(),
    createdAt: now,
    updatedAt: now,
  })
  const planRecord = plan
    ? parseOrThrow(DosagePlanCreateSchema, buildPlanRecord(record.id, plan))
    : null

  await db.transaction('rw', db.supplements, db.dosagePlans, async () => {
    await db.supplements.add(record)
    if (planRecord) await db.dosagePlans.add(planRecord)
  })

  publishDataChange()
  return record
}

export async function updateSupplement(id: string, patch: SupplementUpdateInput): Promise<void> {
  if (!(await db.supplements.get(id))) throw new Error('补剂不存在')
  const parsed = parseOrThrow(SupplementUpdateSchema, patch)
  await supplementRepository.update(id, { ...parsed, updatedAt: nowIso() })
  publishDataChange()
}

/** 手动调整余量（覆盖式，不记账、不写流水，§6.5） */
export async function setStockCount(id: string, stockCount: number | null): Promise<void> {
  if (!(await db.supplements.get(id))) throw new Error('补剂不存在')
  await supplementRepository.setStockCount(id, stockCount)
  publishDataChange()
}

/**
 * 硬删除补剂（D2=A）。级联规则（DIFF-03）：
 * - dosagePlans：该补剂全部 → 硬删除
 * - pausePeriods：该补剂自己的条目不删 'ALL'（全局停药不属于任何单个补剂）
 * - dailyIntakes：deleteRecords=true 才删；否则保留为孤儿记录（UI 显示「[已删除的补剂]」）
 * - supplementIngredients：硬删除
 *
 * @param deleteRecords 是否同时删除该补剂的历史记录（UI 默认勾选）
 */
export async function deleteSupplement(id: string, deleteRecords: boolean): Promise<void> {
  await db.transaction(
    'rw',
    [db.supplements, db.dosagePlans, db.dailyIntakes, db.pausePeriods, db.supplementIngredients],
    async () => {
      const supplement = await db.supplements.get(id)
      if (!supplement) throw new Error('补剂不存在')

      await db.supplements.delete(id)
      await dosagePlanRepository.deleteBySupplement(id)
      await pausePeriodRepository.deleteBySupplement(id)
      await supplementIngredientRepository.deleteBySupplement(id)
      if (deleteRecords) await dailyIntakeRepository.deleteBySupplement(id)
    },
  )

  publishDataChange()
}

/** 删除前的统计，用于确认框展示具体数字（RK-01） */
export async function countRelatedRecords(id: string): Promise<number> {
  return dailyIntakeRepository.countBySupplement(id)
}
