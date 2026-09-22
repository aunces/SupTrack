import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { pausePeriodRepository, pauseSchemeRepository, supplementRepository } from '@/repositories'
import { useDataVersion } from '@/stores/dataVersion'
import type { PausePeriod, PauseScheme, Supplement } from '@/types'

/**
 * 停药页数据（实施指导书 §7.8）。
 * 两个分区并列：方案组（成套情景） / 临时停药（随手加一条）。
 */

export interface PauseSchemeRow {
  scheme: PauseScheme
  /** 该方案组的条目（编辑 Dialog 要用它们回填「跟随方案 / 独立起止」） */
  entries: PausePeriod[]
  /** 覆盖几项条目（列表展示「覆盖 3 项」） */
  entryCount: number
}

export interface PausePeriodRow {
  period: PausePeriod
  /** '全部补剂' 或补剂名；补剂已被删除时为 undefined */
  targetName: string
  isAll: boolean
}

export interface PauseData {
  schemes: PauseSchemeRow[]
  periods: PausePeriodRow[]
  supplements: Supplement[]
  loading: boolean
}

export function usePauseData(): PauseData {
  const version = useDataVersion((s) => s.version)

  const raw = useLiveQuery(
    async () => {
      const [schemes, periods, supplements] = await Promise.all([
        pauseSchemeRepository.all(),
        pausePeriodRepository.all(),
        supplementRepository.all(),
      ])
      return { schemes, periods, supplements }
    },
    [version],
    undefined,
  )

  return useMemo(() => {
    if (!raw) return { schemes: [], periods: [], supplements: [], loading: true }

    const supplementMap = new Map(raw.supplements.map((s) => [s.id, s]))

    const schemes: PauseSchemeRow[] = raw.schemes.map((scheme) => {
      const entries = raw.periods.filter((period) => period.schemeId === scheme.id)
      return { scheme, entries, entryCount: entries.length }
    })

    const periods: PausePeriodRow[] = raw.periods
      .filter((period) => period.schemeId == null)
      .map((period) => {
        const isAll = period.supplementId === 'ALL'
        const supplement = supplementMap.get(period.supplementId)
        return {
          period,
          isAll,
          targetName: isAll ? '全部补剂' : (supplement?.name ?? '[已删除的补剂]'),
        }
      })

    return { schemes, periods, supplements: raw.supplements, loading: false }
  }, [raw])
}
