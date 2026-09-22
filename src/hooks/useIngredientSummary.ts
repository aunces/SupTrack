import { useLiveQuery } from 'dexie-react-hooks'
import { summarizeDate } from '@/services/summaryService'
import { useDataVersion } from '@/stores/dataVersion'
import type { IngredientTotal } from '@/utils/summary'

/**
 * 某日成分汇总（§7.8 / T-305）。
 *
 * 判定全在 services/summaryService → utils/summary，hook 只做订阅。
 * 成分汇总**不影响**今日页的任何其他部分：把这一块删掉，
 * 打卡、余量、预警全都照常工作（§13.3 M3 判据）。
 */

export interface IngredientSummaryData {
  totals: IngredientTotal[]
  loading: boolean
}

export function useIngredientSummary(date: string): IngredientSummaryData {
  const version = useDataVersion((s) => s.version)
  const totals = useLiveQuery(() => summarizeDate(date), [date, version], undefined)

  return { totals: totals ?? [], loading: totals === undefined }
}
