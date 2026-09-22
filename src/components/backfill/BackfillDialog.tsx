import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TIME_SLOT_LABEL, type TimeSlot } from '@/constants/enums'
import { UNIT_TYPE_LABEL } from '@/constants/units'
import { backfillOne, listBackfillableItems } from '@/services/backfillService'
import { toast } from '@/stores/toastStore'
import { backfillRange } from '@/utils/date'
import type { DayItem } from '@/utils/dayState'

/**
 * 补录（§8.4 / T-205）。
 *
 * 窗口硬约束 `[today-7, yesterday]`（D-07），date picker 的 min/max 只是第一道，
 * service 还会再拦一次（backfillService.assertInWindow）。
 *
 * 「已服用 / 漏服」是单选而不是两个按钮：这是**一次记录的两种取值**，不是两个动作。
 * 漏服同样写一条记录（taken=false），所以「我那天忘了吃」和「我那天没吃」在数据上
 * 是同一件事的两种表达 —— 日级状态由 resolveDayStatus 现算，不存字段。
 *
 * 补剂下拉只列**该日可补录的应服项**：休息日、停用日、已记录的项根本不会出现，
 * 用户不需要先选完再被告知「这个不能补」。
 */

interface BackfillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 预选日期（日历页点「补录一条」时传入选中日）；缺失则默认昨天 */
  defaultDate?: string
}

export function BackfillDialog({ open, onOpenChange, defaultDate }: BackfillDialogProps) {
  const { min, max } = backfillRange()

  const [date, setDate] = useState(max)
  const [items, setItems] = useState<DayItem[]>([])
  const [loading, setLoading] = useState(false)
  const [supplementId, setSupplementId] = useState('')
  const [timeSlot, setTimeSlot] = useState<TimeSlot | ''>('')
  const [taken, setTaken] = useState<'yes' | 'no'>('yes')
  const [amount, setAmount] = useState('1')
  const [saving, setSaving] = useState(false)

  // 每次打开重置：对话框不该记住上一次的日期与选择
  useEffect(() => {
    if (!open) return
    setDate(defaultDate && defaultDate >= min && defaultDate <= max ? defaultDate : max)
    setTaken('yes')
    setSaving(false)
  }, [open, defaultDate, min, max])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    void listBackfillableItems(date)
      .then((list) => {
        if (cancelled) return
        setItems(list)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setItems([])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, date])

  // 候选项变化后收敛选择：日期一换，原来的补剂/时段可能已不可补录
  useEffect(() => {
    if (items.length === 0) {
      setSupplementId('')
      setTimeSlot('')
      return
    }
    const sameSupplement = items.filter((item) => item.supplementId === supplementId)
    if (sameSupplement.length === 0) {
      const first = items[0]
      setSupplementId(first.supplementId)
      setTimeSlot(first.timeSlot)
      setAmount(String(first.amountDue || 1))
      return
    }
    if (!sameSupplement.some((item) => item.timeSlot === timeSlot)) {
      const first = sameSupplement[0]
      setTimeSlot(first.timeSlot)
      setAmount(String(first.amountDue || 1))
    }
  }, [items, supplementId, timeSlot])

  const supplementOptions = items.filter(
    (item, index) => items.findIndex((other) => other.supplementId === item.supplementId) === index,
  )
  const slotOptions = items.filter((item) => item.supplementId === supplementId)
  const selected = slotOptions.find((item) => item.timeSlot === timeSlot)
  const unitLabel = selected?.supplement ? UNIT_TYPE_LABEL[selected.supplement.unitType] : '份'

  async function handleSubmit() {
    if (!selected) {
      toast('请选择要补录的补剂与时段', { variant: 'warning' })
      return
    }
    const parsed = Number(amount)
    if (!Number.isInteger(parsed) || parsed < 1) {
      toast('数量必须是不小于 1 的整数', { variant: 'warning' })
      return
    }

    setSaving(true)
    try {
      await backfillOne({
        date,
        supplementId: selected.supplementId,
        timeSlot: selected.timeSlot,
        amount: parsed,
        taken: taken === 'yes',
      })
      onOpenChange(false)
      toast(taken === 'yes' ? '已补录为服用' : '已补录为漏服')
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const hasItems = items.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>补录一条</DialogTitle>
          <DialogDescription>只能补最近 7 天，不含今天。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="backfill-date">日期 *</Label>
            <Input
              id="backfill-date"
              type="date"
              min={min}
              max={max}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="backfill-supplement">补剂 *</Label>
            <Select
              value={supplementId}
              onValueChange={setSupplementId}
              disabled={loading || !hasItems}
            >
              <SelectTrigger id="backfill-supplement" className="w-full">
                <SelectValue placeholder={loading ? '读取中…' : '该日没有可补录的项'} />
              </SelectTrigger>
              <SelectContent>
                {supplementOptions.map((item) => (
                  <SelectItem key={item.supplementId} value={item.supplementId}>
                    {item.supplement?.name ?? '[已删除的补剂]'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="backfill-slot">时段 *</Label>
            <Select
              value={timeSlot}
              onValueChange={(value) => {
                const next = slotOptions.find((item) => item.timeSlot === value)
                setTimeSlot(value as TimeSlot)
                // 换时段时数量跟着该时段的计划量走
                if (next) setAmount(String(next.amountDue || 1))
              }}
              disabled={loading || slotOptions.length === 0}
            >
              <SelectTrigger id="backfill-slot" className="w-full">
                <SelectValue placeholder="选择时段" />
              </SelectTrigger>
              <SelectContent>
                {slotOptions.map((item) => (
                  <SelectItem key={item.timeSlot} value={item.timeSlot}>
                    {TIME_SLOT_LABEL[item.timeSlot]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>状态</Label>
            <RadioGroup
              value={taken}
              onValueChange={(value) => setTaken(value as 'yes' | 'no')}
              className="flex gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="backfill-taken" value="yes" />
                <Label htmlFor="backfill-taken" className="font-normal">
                  已服用
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="backfill-missed" value="no" />
                <Label htmlFor="backfill-missed" className="font-normal">
                  漏服
                </Label>
              </div>
            </RadioGroup>
            <p className="text-muted-foreground text-xs">
              {taken === 'yes' ? '会从余量里扣掉这一次的量。' : '只标记没吃，余量不变。'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="backfill-amount">数量 *</Label>
            <div className="flex items-center gap-2">
              <Input
                id="backfill-amount"
                type="number"
                min={1}
                step={1}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <span className="text-muted-foreground text-sm whitespace-nowrap">{unitLabel}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !selected}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default BackfillDialog
