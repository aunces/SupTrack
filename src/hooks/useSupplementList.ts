import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { TIME_SLOT_LABEL } from '@/constants/enums'
import { dailyIntakeRepository, dosagePlanRepository, supplementRepository } from '@/repositories'
import { useDataVersion } from '@/stores/dataVersion'
import type { DailyIntake, DosagePlan, Supplement } from '@/types'
import { describeRate, isRateConfigValid } from '@/utils/rate'
import { isLowStock } from '@/utils/stock'

/**
 * 补剂页数据（实施指导书 §7.8）。
 *
 * 「补剂 + 它的服用节奏」合并在同一个入口：节奏在数据上属于计划，
 * 但在用户心里它就是「这个补剂怎么吃」，所以不单独开一个「服用计划」页面。
 */

export interface SupplementRow {
  supplement: Supplement
  /** 可编辑的那条计划：启用中优先，否则最近创建的一条（含已关闭） */
  plan: DosagePlan | undefined
  /** 用户语言：「隔天」「吃 5 停 2」，不暴露参数 */
  rateLabel: string
  timeSlotLabels: string[]
  /** 节奏或停药参数缺失 / 非法（R-08：仍然出现在今日页，只在管理页标异常） */
  configError: boolean
  recordCount: number
  lowStock: boolean
}

export interface SupplementListData {
  rows: SupplementRow[]
  loading: boolean
}

interface RawData {
  supplements: Supplement[]
  plans: DosagePlan[]
  records: DailyIntake[]
}

export function useSupplementList(): SupplementListData {
  const version = useDataVersion((s) => s.version)

  const raw = useLiveQuery(
    async (): Promise<RawData> => {
      const [supplements, plans, records] = await Promise.all([
        supplementRepository.all(),
        dosagePlanRepository.all(),
        dailyIntakeRepository.all(),
      ])
      return { supplements, plans, records }
    },
    [version],
    undefined,
  )

  return useMemo(() => {
    if (!raw) return { rows: [], loading: true }

    const rows: SupplementRow[] = raw.supplements
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((supplement) => {
        const own = raw.plans.filter((plan) => plan.supplementId === supplement.id)
        const active = own.find((plan) => plan.isActive)
        const plan =
          active ??
          own
            .slice()
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .at(-1)

        return {
          supplement,
          plan,
          rateLabel: plan ? describeRate(plan) : '—',
          timeSlotLabels: plan ? plan.timeSlots.map((slot) => TIME_SLOT_LABEL[slot]) : [],
          configError: plan ? !isRateConfigValid(plan) : false,
          recordCount: raw.records.filter((r) => r.supplementId === supplement.id).length,
          lowStock: isLowStock(supplement, raw.plans),
        }
      })

    return { rows, loading: false }
  }, [raw])
}
