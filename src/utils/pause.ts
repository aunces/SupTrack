import { differenceInCalendarDays, parseISO } from 'date-fns'
import { CYCLE_MODE } from '@/constants/enums'
import { NOT_DELETED } from '@/constants/deletedAt'
import type { PausePeriod } from '@/types'

/** 单个停药期是否覆盖该日期 */
export function isPausedOnDate(period: PausePeriod, date: string): boolean {
  if (date < period.startDate) return false
  if (period.endDate != null && date > period.endDate) return false

  if (period.cycleMode !== CYCLE_MODE.CYCLIC) return true

  const anchor = period.cycleStartDate
  const on = period.cycleOnDays
  const off = period.cycleOffDays
  if (!anchor || on == null || off == null) return true

  const diff = differenceInCalendarDays(parseISO(date), parseISO(anchor))
  if (diff < 0) return false
  // cycleStartDate 当天算周期第 1 天（吃）
  return diff % (on + off) >= on
}

/**
 * 并集语义：补剂级与全局任一覆盖该日即停药。
 * 传入 periods 以保持纯函数可测；调用方负责从仓储取数据。
 */
export function isPaused(
  supplementId: string,
  date: string,
  periods: PausePeriod[],
): { paused: boolean; reasons: PausePeriod[] } {
  const reasons = periods.filter(
    (p) =>
      p.deletedAt === NOT_DELETED &&
      (p.supplementId === supplementId || p.supplementId == null) &&
      isPausedOnDate(p, date),
  )
  return { paused: reasons.length > 0, reasons }
}
