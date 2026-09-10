import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TIME_SLOT_LABEL } from '@/constants/enums'
import { STOCK_STATE } from '@/constants/stockState'
import type { TimeSlot } from '@/types'
import {
  dosagePlanRepository,
  dailyIntakeRepository,
  ingredientRepository,
  pausePeriodRepository,
  supplementIngredientRepository,
  supplementRepository,
} from '@/repositories'
import { purgeIntake, restoreIntake } from '@/services/intakeService'
import { useDataVersion } from '@/stores/dataVersion'
import { toast } from '@/stores/toastStore'
import type { DailyIntake } from '@/types'

type TabKey =
  | 'supplements'
  | 'ingredients'
  | 'supplementIngredients'
  | 'dosagePlans'
  | 'dailyIntakes'
  | 'pausePeriods'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'supplements', label: '补剂' },
  { key: 'ingredients', label: '成分' },
  { key: 'supplementIngredients', label: '成分关联' },
  { key: 'dosagePlans', label: '计划' },
  { key: 'dailyIntakes', label: '记录' },
  { key: 'pausePeriods', label: '停药期' },
]

async function loadTrash(tab: TabKey) {
  switch (tab) {
    case 'supplements':
      return supplementRepository.trash()
    case 'ingredients':
      return ingredientRepository.trash()
    case 'supplementIngredients':
      return supplementIngredientRepository.trash()
    case 'dosagePlans':
      return dosagePlanRepository.trash()
    case 'dailyIntakes':
      return dailyIntakeRepository.trash()
    case 'pausePeriods':
      return pausePeriodRepository.trash()
  }
}

function displayName(row: Record<string, unknown>, tab: TabKey): string {
  if (tab === 'supplements' || tab === 'ingredients') return String(row.name)
  if (tab === 'dosagePlans') return `计划 · ${String(row.supplementId).slice(0, 8)}`
  if (tab === 'pausePeriods') return `停药期 ${String(row.startDate)} ~ ${row.endDate ?? '持续'}`
  if (tab === 'supplementIngredients') return `关联 ${String(row.ingredientId).slice(0, 8)}`
  const slot = TIME_SLOT_LABEL[row.timeSlot as TimeSlot] ?? String(row.timeSlot)
  return `${String(row.date)} ${slot} × ${String(row.actualAmount)}`
}

export function RecycleBin() {
  const version = useDataVersion((s) => s.version)
  const [tab, setTab] = useState<TabKey>('dailyIntakes')
  const rows = useLiveQuery(() => loadTrash(tab), [tab, version], [])
  const [unknownRow, setUnknownRow] = useState<DailyIntake | null>(null)

  async function restore(row: Record<string, unknown>) {
    const id = String(row.id)
    if (tab === 'dailyIntakes') {
      if (row.stockState === STOCK_STATE.UNKNOWN) {
        setUnknownRow(row as unknown as DailyIntake)
        return
      }
      await restoreIntake(id)
      toast('已恢复')
      return
    }
    switch (tab) {
      case 'supplements':
        await supplementRepository.restore(id)
        break
      case 'ingredients':
        await ingredientRepository.restore(id)
        break
      case 'supplementIngredients':
        await supplementIngredientRepository.restore(id)
        break
      case 'dosagePlans':
        await dosagePlanRepository.restore(id)
        break
      case 'pausePeriods':
        await pausePeriodRepository.restore(id)
        break
    }
    toast('已恢复')
  }

  async function purge(row: Record<string, unknown>) {
    const id = String(row.id)
    if (tab === 'dailyIntakes') {
      await purgeIntake(id)
    } else {
      switch (tab) {
        case 'supplements':
          await supplementRepository.purge(id)
          break
        case 'ingredients':
          await ingredientRepository.purge(id)
          break
        case 'supplementIngredients':
          await supplementIngredientRepository.purge(id)
          break
        case 'dosagePlans':
          await dosagePlanRepository.purge(id)
          break
        case 'pausePeriods':
          await pausePeriodRepository.purge(id)
          break
      }
    }
    toast('已彻底删除')
  }

  async function clearAll() {
    if (!window.confirm('清空该表所有回收站记录？此操作不可恢复。')) return
    for (const row of rows) {
      await purge(row as unknown as Record<string, unknown>)
    }
    toast('已清空')
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map((item) => (
          <Button
            key={item.key}
            size="sm"
            variant={tab === item.key ? 'default' : 'outline'}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={clearAll}>
          一键清空
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">回收站为空</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => {
            const record = row as unknown as Record<string, unknown>
            return (
              <li
                key={String(record.id)}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  {displayName(record, tab)}
                  {tab === 'dailyIntakes' && record.stockState === STOCK_STATE.UNKNOWN && (
                    <Badge variant="destructive">库存状态未知</Badge>
                  )}
                  {tab === 'dailyIntakes' && record.stockState === STOCK_STATE.WAS_DEDUCTED && (
                    <Badge variant="secondary">曾扣库存（已回滚）</Badge>
                  )}
                </span>
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => restore(record)}>
                    恢复
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => purge(record)}>
                    彻底删除
                  </Button>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={Boolean(unknownRow)} onOpenChange={() => setUnknownRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>恢复旧版本记录</DialogTitle>
          </DialogHeader>
          <p className="text-sm">该记录来自旧版本，无法确定当时是否扣过库存。请选择恢复方式：</p>
          <p className="text-muted-foreground text-xs">
            ⚠️
            若该记录在旧版本中已扣过库存，选"视为已扣"会再扣一次，导致库存偏少。若不确定，建议选"视为未扣"后手动核对库存。
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={async () => {
                if (unknownRow) await restoreIntake(unknownRow.id, 'not_deducted')
                setUnknownRow(null)
                toast('已恢复，库存处理方式：视为未扣')
              }}
            >
              视为未扣
            </Button>
            <Button
              onClick={async () => {
                if (unknownRow) await restoreIntake(unknownRow.id, 'deducted')
                setUnknownRow(null)
                toast('已恢复，库存处理方式：视为已扣')
              }}
            >
              视为已扣（重扣 {unknownRow?.actualAmount ?? 0}）
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default RecycleBin
