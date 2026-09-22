import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import {
  dailyIntakeRepository,
  dosagePlanRepository,
  pausePeriodRepository,
  pauseSchemeRepository,
  supplementRepository,
} from '@/repositories'
import { useDataVersion } from '@/stores/dataVersion'
import type { DailyIntake, DosagePlan, PausePeriod, PauseScheme, Supplement } from '@/types'
import { addDays, today } from '@/utils/date'
import { buildCalendarDays, gridStart, type CalendarDay } from '@/utils/calendar'

/**
 * 日历月数据（实施指导书 §7.8 / §8.4 / T-203）。
 *
 * 这个 hook 只做数据搬运：取材 → 交给 utils/calendar 推导。
 * 判定一行都不写在这里 —— 所以「过去没记的算漏服」这类规则能被单独测，
 * 不需要渲染整个日历。
 *
 * 日级状态是**逐日算出来的**，库里没有「漏服」「完成」字段：
 * 补录一条漏服之后不需要更新任何状态位，重算一遍就对了。
 * 这也是日历与今日页永远不会各说各话的原因。
 */

interface RawData {
  plans: DosagePlan[]
  records: DailyIntake[]
  supplements: Supplement[]
  periods: PausePeriod[]
  schemes: PauseScheme[]
}

const EMPTY: RawData = { plans: [], records: [], supplements: [], periods: [], schemes: [] }

export interface CalendarMonthData {
  /** 42 格（6 行 × 7 列），含邻月补位格 */
  days: CalendarDay[]
  loading: boolean
}

export function useCalendarMonth(year: number, month: number): CalendarMonthData {
  const version = useDataVersion((s) => s.version)
  const start = gridStart(year, month)
  const end = addDays(start, 41)

  const raw = useLiveQuery(
    async (): Promise<RawData> => {
      const [plans, records, supplements, periods, schemes] = await Promise.all([
        dosagePlanRepository.listActive(),
        dailyIntakeRepository.listByDateRange(start, end),
        supplementRepository.all(),
        pausePeriodRepository.all(),
        pauseSchemeRepository.all(),
      ])
      return { plans, records, supplements, periods, schemes }
    },
    [start, end, version],
    undefined,
  )

  return useMemo(() => {
    const data = raw ?? EMPTY
    const days = buildCalendarDays({
      year,
      month,
      plans: data.plans,
      supplements: new Map(data.supplements.map((s) => [s.id, s])),
      records: data.records,
      pauseCtx: {
        periods: data.periods,
        schemes: new Map(data.schemes.map((s) => [s.id, s])),
      },
      todayStr: today(),
    })
    return { days, loading: raw === undefined }
  }, [raw, year, month])
}
