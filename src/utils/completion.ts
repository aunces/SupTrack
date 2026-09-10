import { PLANNED_AMOUNT_SOURCE } from '@/constants/enums'
import type { DailyIntake, DosagePlan, PausePeriod } from '@/types'
import { isPaused } from './pause'

export interface DayStat {
  date: string
  /** 应服计划项（按 timeSlots 展开，已排除停药日） */
  planned: number
  taken: number
  skipped: number
  extra: number
  paused: boolean
  /** null 表示无计划 */
  completion: number | null
}

export interface CompletionInput {
  date: string
  /** 该日启用且 createdAt <= date 的计划 */
  plans: DosagePlan[]
  /** 该日未删除的摄入记录 */
  intakes: DailyIntake[]
  periods: PausePeriod[]
}

/**
 * 完成度 = 已服计划项 / (应服计划项 - 停药期排除项)
 * - 手动录入（source=manual）不计入分子
 * - 分母为 0 时 completion 为 null（UI 显示"无计划"）
 */
export function computeDayStat({ date, plans, intakes, periods }: CompletionInput): DayStat {
  const plannedItems = new Set<string>()
  let pausedCount = 0

  for (const plan of plans) {
    if (isPaused(plan.supplementId, date, periods).paused) {
      pausedCount += plan.timeSlots.length
      continue
    }
    for (const timeSlot of plan.timeSlots) {
      plannedItems.add(`${plan.supplementId}|${timeSlot}`)
    }
  }

  // 只有命中"应服计划项"的记录才与完成度有关：
  // - 今日手动录入（source=manual 且非补录）不计入完成度
  // - 补录"已服用"命中计划项时 plannedAmountSource = current_plan，计入完成度
  const matched = intakes.filter((r) => plannedItems.has(`${r.supplementId}|${r.timeSlot}`))
  const taken = matched.filter(
    (r) =>
      (r.status === 'taken' || r.status === 'partial') &&
      (r.source === 'plan' || r.plannedAmountSource === PLANNED_AMOUNT_SOURCE.CURRENT_PLAN),
  ).length
  const skipped = matched.filter((r) => r.status === 'skipped').length
  const extra = intakes.filter((r) => r.status === 'extra').length
  const planned = plannedItems.size

  return {
    date,
    planned,
    taken,
    skipped,
    extra,
    paused: pausedCount > 0,
    completion: planned === 0 ? null : Math.min(1, taken / planned),
  }
}
