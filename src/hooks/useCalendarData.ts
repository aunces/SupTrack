import { useLiveQuery } from 'dexie-react-hooks'
import { eachDayOfInterval, endOfMonth, format, startOfMonth } from 'date-fns'
import { getActivePlansForDate } from '@/services/backfillService'
import { dailyIntakeRepository, pausePeriodRepository } from '@/repositories'
import { useDataVersion } from '@/stores/dataVersion'
import { computeDayStat, type DayStat } from '@/utils/completion'

export type { DayStat }

export function useCalendarData(monthKey: string): DayStat[] | undefined {
  const version = useDataVersion((s) => s.version)

  return useLiveQuery(async () => {
    const first = startOfMonth(new Date(`${monthKey}-01`))
    const last = endOfMonth(first)
    const startDate = format(first, 'yyyy-MM-dd')
    const endDate = format(last, 'yyyy-MM-dd')

    const [intakes, periods] = await Promise.all([
      dailyIntakeRepository.listByDateRange(startDate, endDate),
      pausePeriodRepository.all(),
    ])

    const stats: DayStat[] = []
    for (const day of eachDayOfInterval({ start: first, end: last })) {
      const date = format(day, 'yyyy-MM-dd')
      const plans = await getActivePlansForDate(date, { onlyExistingAtDate: true })
      stats.push(
        computeDayStat({
          date,
          plans,
          intakes: intakes.filter((r) => r.date === date),
          periods,
        }),
      )
    }
    return stats
  }, [monthKey, version])
}
