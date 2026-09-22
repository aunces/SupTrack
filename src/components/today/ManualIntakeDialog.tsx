import { useLiveQuery } from 'dexie-react-hooks'
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
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TIME_SLOT_LABEL, TIME_SLOT_VALUES, type TimeSlot } from '@/constants/enums'
import { UNIT_TYPE_LABEL } from '@/constants/units'
import { supplementRepository } from '@/repositories'
import { DuplicateIntakeError, createIntake } from '@/services/intakeService'
import { useDataVersion } from '@/stores/dataVersion'
import { toast } from '@/stores/toastStore'
import { today } from '@/utils/date'

/**
 * 手动录入（§8.1 标题区次要入口）：记录没有计划的一次服用。
 *
 * D-13：planId = null、origin = 'manual' —— 它不进计划清单，归入「计划外记录」分组。
 */
interface ManualIntakeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ManualIntakeDialog({ open, onOpenChange }: ManualIntakeDialogProps) {
  const version = useDataVersion((s) => s.version)
  const supplements = useLiveQuery(() => supplementRepository.all(), [version], [])

  const [supplementId, setSupplementId] = useState('')
  const [timeSlot, setTimeSlot] = useState<TimeSlot>('morning')
  const [amount, setAmount] = useState('1')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setSupplementId('')
    setTimeSlot('morning')
    setAmount('1')
  }, [open])

  const selected = supplements?.find((s) => s.id === supplementId)
  const unitLabel = selected ? UNIT_TYPE_LABEL[selected.unitType] : '份'

  async function handleSubmit() {
    if (!supplementId) {
      toast('请选择补剂', { variant: 'warning' })
      return
    }
    const parsed = Number(amount)
    if (!Number.isInteger(parsed) || parsed < 1) {
      toast('数量必须是不小于 1 的整数', { variant: 'warning' })
      return
    }

    setSaving(true)
    try {
      await createIntake({
        date: today(),
        supplementId,
        planId: null,
        timeSlot,
        amount: parsed,
        origin: 'manual',
      })
      onOpenChange(false)
    } catch (error) {
      if (error instanceof DuplicateIntakeError) {
        toast('这个时段已经记过了，请在今日页对应的行点「追加一次」', { variant: 'warning' })
      } else {
        toast((error as Error).message, { variant: 'destructive' })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>手动录入</DialogTitle>
          <DialogDescription>
            记录没有计划的一次服用，它会出现在「计划外记录」里。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="manual-supplement">补剂 *</Label>
            <Select value={supplementId} onValueChange={setSupplementId}>
              <SelectTrigger id="manual-supplement" className="w-full">
                <SelectValue placeholder="选择补剂" />
              </SelectTrigger>
              <SelectContent>
                {(supplements ?? []).map((supplement) => (
                  <SelectItem key={supplement.id} value={supplement.id}>
                    {supplement.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-slot">服用时段 *</Label>
            <Select value={timeSlot} onValueChange={(value) => setTimeSlot(value as TimeSlot)}>
              <SelectTrigger id="manual-slot" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_SLOT_VALUES.map((slot) => (
                  <SelectItem key={slot} value={slot}>
                    {TIME_SLOT_LABEL[slot]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-amount">数量 *</Label>
            <div className="flex items-center gap-2">
              <Input
                id="manual-amount"
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
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? '记录中…' : '记录'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ManualIntakeDialog
