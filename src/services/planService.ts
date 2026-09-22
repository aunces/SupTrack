import { db } from '@/db'
import { RATE_MODE, type RateMode, type TimeSlot } from '@/constants/enums'
import { dosagePlanRepository } from '@/repositories'
import { parseOrThrow } from '@/schemas/common'
import { DosagePlanCreateSchema, DosagePlanUpdateSchema } from '@/schemas/dosagePlan'
import type { DosagePlanCreateInput } from '@/schemas/dosagePlan'
import type { DosagePlan } from '@/types'
import { publishDataChange } from '@/utils/broadcast'
import { newId, nowIso } from '@/utils/id'

/**
 * 计划（含节奏）（实施指导书 §7.2）。
 *
 * DIFF-02 收紧规则：同一补剂至多 1 条 isActive=true 的计划。
 * 因此本模块**没有「新建第二条计划」的入口** —— 一天吃两次请在同一计划里多选时段，
 * 从源头消除「同一时段重叠」的可能。
 */

export interface PlanDraftInput {
  /** 每次服用量（不是每日量） */
  amountPerTime: number
  timeSlots: TimeSlot[]
  rateMode: RateMode
  rateOnDays: number | null
  rateOffDays: number | null
  rateAnchorDate: string | null
  /** 默认 true */
  isActive?: boolean
  notes?: string | null
}

/** daily 一律清空节奏参数（宽容收窄：不留半截数据给后人误读） */
function normalizeRate(input: PlanDraftInput): {
  rateMode: RateMode
  rateOnDays: number | null
  rateOffDays: number | null
  rateAnchorDate: string | null
} {
  if (input.rateMode === RATE_MODE.DAILY) {
    return { rateMode: RATE_MODE.DAILY, rateOnDays: null, rateOffDays: null, rateAnchorDate: null }
  }
  return {
    rateMode: input.rateMode,
    rateOnDays: input.rateOnDays,
    rateOffDays: input.rateOffDays,
    rateAnchorDate: input.rateAnchorDate,
  }
}

/** 构造一条待写入的计划（supplementService 新建补剂时也要用，故导出） */
export function buildPlanRecord(
  supplementId: string,
  input: PlanDraftInput,
): DosagePlanCreateInput {
  const now = nowIso()
  const rate = normalizeRate(input)
  return {
    id: newId(),
    supplementId,
    amountPerTime: input.amountPerTime,
    // 去重后交给 Zod；重复时段在校验层仍是被拒的
    timeSlots: [...new Set(input.timeSlots)],
    rateMode: rate.rateMode,
    rateOnDays: rate.rateOnDays,
    rateOffDays: rate.rateOffDays,
    rateAnchorDate: rate.rateAnchorDate,
    isActive: input.isActive ?? true,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * 该补剂当前「可编辑的那条计划」：
 * 优先启用中的，其次最近创建的一条（含已关闭）—— 避免每次保存都攒一条新计划。
 */
async function resolveEditablePlan(supplementId: string): Promise<DosagePlan | undefined> {
  const plans = await dosagePlanRepository.listBySupplement(supplementId)
  if (plans.length === 0) return undefined
  const active = plans.find((plan) => plan.isActive)
  if (active) return active
  return plans.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))[plans.length - 1]
}

/** 保证「同补剂至多一条启用计划」这个不变量（DIFF-02） */
async function enforceSingleActive(supplementId: string, keepPlanId: string): Promise<void> {
  const plans = await dosagePlanRepository.listBySupplement(supplementId)
  for (const plan of plans) {
    if (plan.id !== keepPlanId && plan.isActive) {
      await dosagePlanRepository.update(plan.id, { isActive: false })
    }
  }
}

/**
 * 保存补剂的计划（新建或更新）。
 * 若已存在可编辑的计划，则更新它；否则新建。
 * isActive=false 时今日页不再出现，历史记录保留（P6：计划关闭 ≠ 节奏休息）。
 */
export async function savePlanForSupplement(
  supplementId: string,
  input: PlanDraftInput,
): Promise<DosagePlan> {
  const supplement = await db.supplements.get(supplementId)
  if (!supplement) throw new Error('补剂不存在')

  let saved!: DosagePlan

  await db.transaction('rw', db.supplements, db.dosagePlans, async () => {
    const existing = await resolveEditablePlan(supplementId)

    if (existing) {
      const rate = normalizeRate(input)
      const parsed = parseOrThrow(DosagePlanUpdateSchema, {
        amountPerTime: input.amountPerTime,
        timeSlots: [...new Set(input.timeSlots)],
        rateMode: rate.rateMode,
        rateOnDays: rate.rateOnDays,
        rateOffDays: rate.rateOffDays,
        rateAnchorDate: rate.rateAnchorDate,
        isActive: input.isActive ?? true,
        notes: input.notes ?? null,
      })
      await db.dosagePlans.update(existing.id, { ...parsed, updatedAt: nowIso() })
      await enforceSingleActive(supplementId, existing.id)
      saved = (await db.dosagePlans.get(existing.id)) as DosagePlan
    } else {
      const record = parseOrThrow(DosagePlanCreateSchema, buildPlanRecord(supplementId, input))
      await db.dosagePlans.add(record)
      await enforceSingleActive(supplementId, record.id)
      saved = record
    }
  })

  publishDataChange()
  return saved
}

/** 关闭计划（P6：与节奏休息是两件事） */
export async function deactivatePlan(planId: string): Promise<void> {
  await dosagePlanRepository.update(planId, { isActive: false })
  publishDataChange()
}

/**
 * 列表内切换某个计划的启用 / 关闭（§7.2 列表切换）。
 *
 * OFF 直接置 isActive=false；ON 走 savePlanForSupplement 重建同一条计划，
 * **完整保留** amountPerTime / timeSlots / rateMode / rateOnDays / rateOffDays /
 * rateAnchorDate / notes —— 只改 isActive，其余参数原样带过。
 * 可逆、无副作用，供补剂列表的状态列调用，无需弹确认框。
 */
export async function setPlanActive(plan: DosagePlan, isActive: boolean): Promise<void> {
  if (!isActive) {
    await deactivatePlan(plan.id)
    return
  }
  await savePlanForSupplement(plan.supplementId, {
    amountPerTime: plan.amountPerTime,
    timeSlots: plan.timeSlots,
    rateMode: plan.rateMode,
    rateOnDays: plan.rateOnDays,
    rateOffDays: plan.rateOffDays,
    rateAnchorDate: plan.rateAnchorDate,
    isActive: true,
    notes: plan.notes,
  })
}

/** 删除计划条目（硬删除） */
export async function deletePlan(planId: string): Promise<void> {
  await db.dosagePlans.delete(planId)
  publishDataChange()
}

/** 校验：该补剂是否已有启用计划 */
export async function hasActivePlan(
  supplementId: string,
  excludePlanId?: string,
): Promise<boolean> {
  const active = await dosagePlanRepository.getActiveBySupplement(supplementId)
  if (!active) return false
  return active.id !== excludePlanId
}
