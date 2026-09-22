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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ALL_SUPPLEMENTS } from '@/constants/enums'
import { createPausePeriod, updatePausePeriod } from '@/services/pauseService'
import { toast } from '@/stores/toastStore'
import { today } from '@/utils/date'
import type { PausePeriod, Supplement } from '@/types'

/**
 * 加一条临时停药（§8.3）。
 *
 * 「全部补剂」不做成独立开关：用一条 supplementId='ALL' 的条目承担，
 * 两个入口表达同一件事会让人分不清。
 *
 * 编辑时**必须**出现那句提示：修改停药参数只影响未来判定，已产生的记录不变。
 * 理由是用户改完历史日期会怀疑「那我前几天记的还算不算数」。
 */
interface PausePeriodDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplements: Supplement[]
  /** 传入则为编辑 */
  period?: PausePeriod | null
}

export function PausePeriodDialog({
  open,
  onOpenChange,
  supplements,
  period,
}: PausePeriodDialogProps) {
  const [supplementId, setSupplementId] = useState('')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setSupplementId(period?.supplementId ?? '')
    setStartDate(period?.startDate ?? today())
    setEndDate(period?.endDate ?? '')
    setReason(period?.reason ?? '')
  }, [open, period])

  async function handleSubmit() {
    if (!supplementId) {
      toast('请选择要停用的补剂', { variant: 'warning' })
      return
    }
    if (!startDate) {
      toast('临时停药必须填写开始日期', { variant: 'warning' })
      return
    }

    const payload = {
      schemeId: period?.schemeId ?? null,
      supplementId,
      startDate,
      endDate: endDate === '' ? null : endDate,
      reason: reason.trim() === '' ? null : reason.trim(),
    }

    setSaving(true)
    try {
      if (period) await updatePausePeriod(period.id, payload)
      else await createPausePeriod(payload)
      onOpenChange(false)
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{period ? '编辑停药' : '加一条停药'}</DialogTitle>
          <DialogDescription>
            {period ? '修改停药参数只影响未来判定，已产生的记录不变。' : '一段有起止的暂停。'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pause-target">停哪个 *</Label>
            <Select value={supplementId} onValueChange={setSupplementId}>
              <SelectTrigger id="pause-target" className="w-full">
                <SelectValue placeholder="选择补剂" />
              </SelectTrigger>
              <SelectContent>
                {supplements.map((supplement) => (
                  <SelectItem key={supplement.id} value={supplement.id}>
                    {supplement.name}
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value={ALL_SUPPLEMENTS}>全部补剂</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pause-start">从哪天开始 *</Label>
              <Input
                id="pause-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              {/* 「含当天」很重要，避免用户算错一天（DIFF-05） */}
              <Label htmlFor="pause-end">到哪天为止（含当天）</Label>
              <Input
                id="pause-end"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            留空 = 持续中，今日页显示「停用中 · 持续中」
          </p>

          <div className="space-y-2">
            <Label htmlFor="pause-reason">原因（可留空）</Label>
            <Input
              id="pause-reason"
              value={reason}
              placeholder="帮未来的你想起为什么停"
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default PausePeriodDialog
