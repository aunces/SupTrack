import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { TIME_SLOT_VALUES, type TimeSlot } from '@/constants/enums'
import { getActivePlansForDate } from '@/services/backfillService'
import { dailyIntakeRepository, pausePeriodRepository, supplementRepository } from '@/repositories'
import { useDataVersion } from '@/stores/dataVersion'
import type { DailyIntake, DosagePlan, PausePeriod, Supplement } from '@/types'
import { today } from '@/utils/date'
import { isPaused } from '@/utils/pause'

export interface TodayPlanItem {
  plan: DosagePlan
  supplement: Supplement | undefined
  timeSlot: TimeSlot
  paused: boolean
  pauseReasons: PausePeriod[]
  record: DailyIntake | undefined
}

export interface TodayData {
  date: string
  groups: Array<{ timeSlot: TimeSlot; items: TodayPlanItem[] }>
  supplements: Supplement[]
  periods: PausePeriod[]
  records: DailyIntake[]
  loading: boolean
}

export function useTodayData(): TodayData {
  const version = useDataVersion((s) => s.version)
  const date = today()

  const plans = useLiveQuery(() => getActivePlansForDate(date), [date, version], [])
  const records = useLiveQuery(() => dailyIntakeRepository.listByDate(date), [date, version], [])
  const supplements = useLiveQuery(() => supplementRepository.all(), [version], [])
  const periods = useLiveQuery(() => pausePeriodRepository.all(), [version], [])

  return useMemo(() => {
    const supplementMap = new Map((supplements ?? []).map((s) => [s.id, s]))
    const items: TodayPlanItem[] = (plans ?? []).flatMap((plan) =>
      plan.timeSlots.map((timeSlot) => {
        const paused = isPaused(plan.supplementId, date, periods ?? [])
        return {
          plan,
          supplement: supplementMap.get(plan.supplementId),
          timeSlot,
          paused: paused.paused,
          pauseReasons: paused.reasons,
          record: (records ?? []).find(
            (r) => r.supplementId === plan.supplementId && r.timeSlot === timeSlot,
          ),
        }
      }),
    )

    const groups = TIME_SLOT_VALUES.map((timeSlot) => ({
      timeSlot,
      items: items.filter((item) => item.timeSlot === timeSlot),
    })).filter((group) => group.items.length > 0)

    return {
      date,
      groups,
      supplements: supplements ?? [],
      periods: periods ?? [],
      records: records ?? [],
      loading: plans === undefined || supplements === undefined,
    }
  }, [date, plans, records, supplements, periods])
}
