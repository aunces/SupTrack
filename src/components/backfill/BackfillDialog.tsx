import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TIME_SLOT_LABEL, TIME_SLOT_VALUES } from '@/constants/enums'
import { UNIT_TYPE_LABEL } from '@/constants/units'
import { getActivePlansForDate } from '@/services/backfillService'
import { supplementRepository, pausePeriodRepository } from '@/repositories'
import { backfillBatch } from '@/services/backfillService'
import { toast } from '@/stores/toastStore'
import type { BackfillItem, BackfillSkippedItem, DosagePlan, Supplement } from '@/types'
import { isPaused } from '@/utils/pause'
import { today } from '@/utils/date'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 默认日期（YYYY-MM-DD） */
  defaultDate?: string
  /** 可选日期范围 [min, max]，默认由调用方传入 */
  range: { min: string; max: string }
  onFinished?: () => void
}

type Choice = 'taken' | 'partial' | 'skipped' | null

interface Row {
  key: string
  supplement: Supplement
  timeSlot: (typeof TIME_SLOT_VALUES)[number]
  plan: DosagePlan | undefined
  paused: boolean
  defaultAmount: number
}

export function BackfillDialog({ open, onOpenChange, defaultDate, range, onFinished }: Props) {
  const [date, setDate] = useState(defaultDate ?? range.max)
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [amounts, setAmounts] = useState<Record<string, number>>({})
  const [rows, setRows] = useState<Row[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [skippedInfo, setSkippedInfo] = useState<{
    existing: BackfillSkippedItem[]
    expiring: BackfillSkippedItem[]
  } | null>(null)

  useEffect(() => {
    if (!open) return
    setDate(defaultDate ?? range.max)
    setChoices({})
  }, [open, defaultDate, range.max])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function load() {
      const [plans, supplements, periods] = await Promise.all([
        getActivePlansForDate(date, { onlyExistingAtDate: true }),
        supplementRepository.all(),
        pausePeriodRepository.all(),
      ])
      if (cancelled) return
      const map = new Map(supplements.map((s) => [s.id, s]))
      const next: Row[] = plans.flatMap((plan) => {
        const supplement = map.get(plan.supplementId)
        if (!supplement) return []
        return plan.timeSlots.map((timeSlot) => ({
          key: `${plan.supplementId}|${timeSlot}`,
          supplement,
          timeSlot,
          plan,
          paused: isPaused(plan.supplementId, date, periods).paused,
          defaultAmount: plan.dailyAmount,
        }))
      })
      setRows(next)
      setAmounts(Object.fromEntries(next.map((row) => [row.key, row.plan?.dailyAmount ?? 1])))
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, date])

  const selected = useMemo(() => rows.filter((row) => choices[row.key]), [rows, choices])

  async function submit() {
    const items: BackfillItem[] = selected.map((row) => ({
      supplementId: row.supplement.id,
      timeSlot: row.timeSlot,
      choice: choices[row.key] as Exclude<Choice, null>,
      actualAmount: amounts[row.key],
    }))
    if (items.length === 0) {
      toast('请先选择要提交的项')
      return
    }
    setSubmitting(true)
    try {
      const result = await backfillBatch(items, date)
      const parts = [`成功 ${result.created} 条`]
      if (result.skippedExisting.length) {
        parts.push(`跳过 ${result.skippedExisting.length} 条（已有记录）`)
      }
      if (result.skippedExpiring.length) {
        parts.push(
          `跳过 ${result.skippedExpiring.length} 条（临期补剂：${result.skippedExpiring
            .map((s) => s.name)
            .join('、')}）`,
        )
      }
      toast(parts.join('，'))
      for (const negative of result.negativeStock) {
        toast(`补剂 ${negative.name} 库存已为负（${negative.stock}）`, { variant: 'warning' })
      }
      if (result.skippedExisting.length > 0 || result.skippedExpiring.length > 0) {
        setSkippedInfo({
          existing: result.skippedExisting,
          expiring: result.skippedExpiring,
        })
      } else {
        onOpenChange(false)
        onFinished?.()
      }
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>补录</DialogTitle>
          <DialogDescription>
            为历史日期补记服用情况。计划量基于当前计划设置，成分含量按历史配方计算。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Label htmlFor="backfill-date">日期</Label>
          <input
            id="backfill-date"
            type="date"
            className="border-input rounded-md border px-2 py-1 text-sm"
            value={date}
            min={range.min}
            max={range.max}
            onChange={(e) => setDate(e.target.value)}
          />
          <span className="text-muted-foreground text-xs">
            可选 {range.min} ~ {range.max}（不含今天 {today()}）
          </span>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">该日期没有启用的计划</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((row) => (
                <li key={row.key} className="flex items-center gap-3 rounded-md border p-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{row.supplement.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {TIME_SLOT_LABEL[row.timeSlot]}
                      {row.plan
                        ? ` · 计划 ${row.plan.dailyAmount} ${UNIT_TYPE_LABEL[row.supplement.unitType]}`
                        : ' · 无计划'}
                      {row.paused ? ' · 该日为停药日' : ''}
                    </div>
                  </div>
                  <Select
                    value={choices[row.key] ?? ''}
                    onValueChange={(value) =>
                      setChoices((prev) => ({ ...prev, [row.key]: value as Choice }))
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="未处理" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="taken">已服用</SelectItem>
                      <SelectItem value="partial">部分服用</SelectItem>
                      <SelectItem value="skipped">漏服</SelectItem>
                    </SelectContent>
                  </Select>
                  <input
                    type="number"
                    min={1}
                    className="border-input w-16 rounded-md border px-2 py-1 text-sm"
                    value={amounts[row.key] ?? 1}
                    onChange={(e) =>
                      setAmounts((prev) => ({
                        ...prev,
                        [row.key]: Number(e.target.value),
                      }))
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {skippedInfo && (
          <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="mb-1 font-medium">已跳过的项</div>
            {skippedInfo.existing.length > 0 && (
              <div>
                已有记录：
                {skippedInfo.existing
                  .map((item) =>
                    item.timeSlot ? `${item.name}（${TIME_SLOT_LABEL[item.timeSlot]}）` : item.name,
                  )
                  .join('、')}
                —— 如需修改，请到日历中选择该日期处理。
              </div>
            )}
            {skippedInfo.expiring.length > 0 && (
              <div>
                临期补剂：
                {skippedInfo.expiring.map((item) => item.name).join('、')}
                —— 请先在补剂库确认是否仍要服用。
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {skippedInfo ? (
            <Button
              onClick={() => {
                setSkippedInfo(null)
                onOpenChange(false)
                onFinished?.()
              }}
            >
              知道了
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button onClick={submit} disabled={submitting || selected.length === 0}>
                提交 {selected.length > 0 ? `（${selected.length}）` : ''}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default BackfillDialog
