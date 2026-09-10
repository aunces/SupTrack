import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
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
import { INTAKE_STATUS_LABEL, INTAKE_STATUS_VALUES, type IntakeStatus } from '@/constants/enums'
import { updateIntake } from '@/services/intakeService'
import { toast } from '@/stores/toastStore'
import type { DailyIntake } from '@/types'

interface Props {
  record: DailyIntake | null
  supplementName: string
  unit: string
  onClose: () => void
}

/** 历史修正：修改状态与数量（库存由状态机同步补扣 / 回滚） */
export function IntakeEditDialog({ record, supplementName, unit, onClose }: Props) {
  const [status, setStatus] = useState<IntakeStatus>('taken')
  const [amount, setAmount] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (record) {
      setStatus(record.status)
      setAmount(record.actualAmount)
    }
  }, [record])

  if (!record) return null

  async function submit() {
    if (!record) return
    setSubmitting(true)
    try {
      await updateIntake(record.id, { status, actualAmount: amount }, 'update')
      toast('已修改')
      onClose()
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={Boolean(record)} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>修改记录 · {supplementName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>状态</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as IntakeStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTAKE_STATUS_VALUES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {INTAKE_STATUS_LABEL[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>数量{unit ? `（${unit}）` : ''}</Label>
            <Input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          改为已服用会补扣库存，改为漏服会回滚库存；库存变动会写入流水。
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={submitting}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default IntakeEditDialog
