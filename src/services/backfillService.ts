import { subDays } from 'date-fns'
import { db } from '@/db'
import { NOT_DELETED } from '@/constants/deletedAt'
import { MISSED_PLAN_DETECT_DAYS } from '@/constants/enums'
import { STOCK_STATE } from '@/constants/stockState'
import { dailyIntakeRepository, dosagePlanRepository, pausePeriodRepository } from '@/repositories'
import type {
  BackfillItem,
  BackfillResult,
  DailyIntake,
  DosagePlan,
  MissedPlan,
  Supplement,
} from '@/types'
import { publishDataChange } from '@/utils/broadcast'
import { formatDate, isExpiringSoon, today, yesterday } from '@/utils/date'
import { newId, nowIso } from '@/utils/id'
import { isPaused } from '@/utils/pause'
import { validateIntakeDate } from './intakeService'
import { applyTransitionInTx } from './stockService'

/**
 * 指定日期的启用计划。
 * onlyExistingAtDate = true 时仅返回 createdAt <= date 的计划（补录 / 次日提醒 / 日历完成度使用）。
 */
export function getActivePlansForDate(
  date: string,
  options: { onlyExistingAtDate?: boolean } = {},
): Promise<DosagePlan[]> {
  return dosagePlanRepository.listActiveForDate(date, options)
}

/**
 * 批量补录（需求 5.8）：
 * - 全部操作在单个 Dexie 事务内完成
 * - 跳过已有记录 / 临期补剂，并分类返回原因
 * - 已服用 → taken / partial（无计划 → extra），扣库存；漏服 → skipped，不扣库存
 */
export async function backfillBatch(items: BackfillItem[], date: string): Promise<BackfillResult> {
  await validateIntakeDate(date, 'backfill')

  const plans = await getActivePlansForDate(date, { onlyExistingAtDate: true })
  const result: BackfillResult = {
    created: 0,
    skippedExisting: [],
    skippedExpiring: [],
    negativeStock: [],
  }
  const touched = new Set<string>()

  await db.transaction('rw', db.dailyIntakes, db.supplements, db.stockLogs, async (tx) => {
    const existing: DailyIntake[] = await tx
      .table('dailyIntakes')
      .where('[deletedAt+date]')
      .between([NOT_DELETED, date], [NOT_DELETED, `${date}\uffff`])
      .toArray()

    for (const item of items) {
      const supp: Supplement | undefined = await tx.table('supplements').get(item.supplementId)
      if (!supp) continue

      const duplicated = existing.some(
        (r) => r.supplementId === item.supplementId && r.timeSlot === item.timeSlot,
      )
      if (duplicated) {
        result.skippedExisting.push({
          supplementId: supp.id,
          name: supp.name,
          timeSlot: item.timeSlot,
        })
        continue
      }

      if (item.choice !== 'skipped' && isExpiringSoon(supp.expiryDate)) {
        result.skippedExpiring.push({ supplementId: supp.id, name: supp.name })
        continue
      }

      const plan = plans.find(
        (p) => p.supplementId === item.supplementId && p.timeSlots.includes(item.timeSlot),
      )
      const status = item.choice === 'skipped' ? 'skipped' : plan ? item.choice : 'extra'
      const actualAmount = item.actualAmount ?? plan?.dailyAmount ?? 1

      const intake: DailyIntake = {
        id: newId(),
        date,
        supplementId: item.supplementId,
        planId: plan?.id ?? null,
        plannedAmount: null,
        plannedAmountSnapshot: plan ? plan.dailyAmount : null,
        plannedAmountSource: plan ? 'current_plan' : 'unavailable',
        actualAmount,
        timeSlot: item.timeSlot,
        status,
        source: 'manual',
        notes: null,
        // 真实 stockState 由状态机决定，此处仅为缺省值
        stockState: item.choice === 'skipped' ? STOCK_STATE.NOT_DEDUCTED : STOCK_STATE.DEDUCTED,
        deletedAt: NOT_DELETED,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }

      await applyTransitionInTx(tx, { type: 'create', intake, source: 'manual' })
      existing.push(intake)
      touched.add(supp.id)
      result.created += 1
    }
  })

  for (const supplementId of touched) {
    const supp = await db.supplements.get(supplementId)
    if (supp && supp.stockCountInUsageUnit != null && supp.stockCountInUsageUnit < 0) {
      result.negativeStock.push({
        supplementId,
        name: supp.name,
        stock: supp.stockCountInUsageUnit,
      })
    }
  }

  publishDataChange()
  return result
}

/**
 * 次日提醒检测：过去 7 天（不含今天）计划内未记录项。
 * 批量查询优化：一次性查出 7 天内记录后内存分组。
 */
export async function detectMissedPlans(): Promise<MissedPlan[]> {
  const todayStr = today()
  const startDate = formatDate(subDays(new Date(), MISSED_PLAN_DETECT_DAYS))
  const endDate = yesterday()

  const intakes = await dailyIntakeRepository.listByDateRange(startDate, endDate)
  const recorded = new Map<string, Set<string>>()
  for (const row of intakes) {
    const key = `${row.date}|${row.supplementId}`
    if (!recorded.has(key)) recorded.set(key, new Set())
    recorded.get(key)!.add(row.timeSlot)
  }

  const periods = await pausePeriodRepository.all()
  const missed: MissedPlan[] = []

  for (let i = 1; i <= MISSED_PLAN_DETECT_DAYS; i++) {
    const date = formatDate(subDays(new Date(), i))
    if (date === todayStr) continue

    const plans = await getActivePlansForDate(date, { onlyExistingAtDate: true })
    for (const plan of plans) {
      for (const timeSlot of plan.timeSlots) {
        const done = recorded.get(`${date}|${plan.supplementId}`)?.has(timeSlot) ?? false
        if (done) continue
        if (isPaused(plan.supplementId, date, periods).paused) continue
        missed.push({ date, supplementId: plan.supplementId, timeSlot, plan })
      }
    }
  }

  return missed
}
