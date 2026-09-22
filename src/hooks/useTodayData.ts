import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { TIME_SLOT_VALUES, type TimeSlot } from '@/constants/enums'
import {
  dailyIntakeRepository,
  dosagePlanRepository,
  pausePeriodRepository,
  pauseSchemeRepository,
  supplementRepository,
} from '@/repositories'
import { useDataVersion } from '@/stores/dataVersion'
import type { DailyIntake, DosagePlan, PausePeriod, PauseScheme, Supplement } from '@/types'
import { isExpiringSoon, today } from '@/utils/date'
import { resolveDayItems, type DayItem } from '@/utils/dayState'
import { isLowStock, isNegativeStock } from '@/utils/stock'

/**
 * 今日页数据（实施指导书 §7.8）。
 *
 * 一次性组装清单、分组、统计、预警。
 * 四态判定全部来自 utils/dayState 的纯函数，hook 只做数据搬运 —— 页面不允许自己判状态。
 */

export interface TodayGroup {
  timeSlot: TimeSlot
  items: DayItem[]
  pendingCount: number
  takenCount: number
  /** 今天不用吃（休息 + 停用），不进完成度分母（P4） */
  offCount: number
}

export interface TodayWarnings {
  negative: Supplement[]
  expiring: Supplement[]
  lowStock: Supplement[]
}

export interface TodayData {
  date: string
  groups: TodayGroup[]
  /** 计划外记录（手动录入 / 追加一次） */
  extraItems: DayItem[]
  summary: { pending: number; taken: number; off: number }
  /** 顶部停药提醒条（M2 接入 UI，M1 只提供数据） */
  activeScheme: PauseScheme | null
  warnings: TodayWarnings
  /** 补剂总数：空状态要区分「首次使用（一个补剂都没有）」与「全部关闭」（§8.1） */
  supplementCount: number
  /** 启用计划数：「全部关闭」的判据是「有补剂但无启用计划」，不是「今天没内容」 */
  activePlanCount: number
  loading: boolean
  error: Error | null
}

interface RawData {
  plans: DosagePlan[]
  records: DailyIntake[]
  supplements: Supplement[]
  periods: PausePeriod[]
  schemes: PauseScheme[]
  error: Error | null
}

const EMPTY: RawData = {
  plans: [],
  records: [],
  supplements: [],
  periods: [],
  schemes: [],
  error: null,
}

export function useTodayData(date?: string): TodayData {
  const version = useDataVersion((s) => s.version)
  const dateStr = date ?? today()

  const raw = useLiveQuery(
    async (): Promise<RawData> => {
      try {
        const [plans, records, supplements, periods, schemes] = await Promise.all([
          dosagePlanRepository.listActive(),
          dailyIntakeRepository.listByDate(dateStr),
          supplementRepository.all(),
          pausePeriodRepository.all(),
          pauseSchemeRepository.all(),
        ])
        return { plans, records, supplements, periods, schemes, error: null }
      } catch (error) {
        // useLiveQuery 没有错误通道，这里把错误变成数据，页面渲染错误态（§8.7）
        return { ...EMPTY, error: error as Error }
      }
    },
    [dateStr, version],
    undefined,
  )

  return useMemo(() => {
    const data = raw ?? EMPTY
    const supplementMap = new Map(data.supplements.map((s) => [s.id, s]))

    const allItems = resolveDayItems({
      date: dateStr,
      plans: data.plans,
      supplements: supplementMap,
      records: data.records,
      pauseCtx: { periods: data.periods, schemes: new Map(data.schemes.map((s) => [s.id, s])) },
    })

    // 计划外记录不进时段分组，单独一块（D-13 / §8.1）
    const extraItems = allItems.filter((item) => item.planId === '')
    const planItems = allItems.filter((item) => item.planId !== '')

    const groups: TodayGroup[] = TIME_SLOT_VALUES.map((timeSlot) => {
      const items = planItems.filter((item) => item.timeSlot === timeSlot)
      return {
        timeSlot,
        items,
        pendingCount: items.filter((i) => i.state === 'pending').length,
        takenCount: items.filter((i) => i.state === 'taken').length,
        offCount: items.filter((i) => i.state === 'rest' || i.state === 'paused').length,
      }
    }).filter((group) => group.items.length > 0)

    const summary = {
      pending: planItems.filter((i) => i.state === 'pending').length,
      taken: planItems.filter((i) => i.state === 'taken').length,
      off: planItems.filter((i) => i.state === 'rest' || i.state === 'paused').length,
    }

    const activePlans = data.plans
    const warnings: TodayWarnings = {
      negative: data.supplements.filter(isNegativeStock),
      expiring: data.supplements.filter((s) => isExpiringSoon(s.expiryDate)),
      lowStock: data.supplements.filter((s) => isLowStock(s, activePlans)),
    }

    return {
      date: dateStr,
      groups,
      extraItems,
      summary,
      activeScheme: data.schemes.find((scheme) => scheme.isActive) ?? null,
      warnings,
      supplementCount: data.supplements.length,
      activePlanCount: data.plans.length,
      loading: raw === undefined,
      error: data.error,
    }
  }, [raw, dateStr])
}
