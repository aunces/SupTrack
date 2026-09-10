import { useState } from 'react'
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
import { UNIT_TYPE_LABEL } from '@/constants/units'
import { supplementRepository } from '@/repositories'
import { toast } from '@/stores/toastStore'
import type { Supplement } from '@/types'

interface Props {
  supplement: Supplement | null
  onClose: () => void
}

export function StockAdjustDialog({ supplement, onClose }: Props) {
  const [delta, setDelta] = useState(0)
  const [note, setNote] = useState('')

  if (!supplement) return null

  async function submit() {
    if (!supplement || delta === 0) return
    await supplementRepository.adjustStock(supplement.id, delta, note || null)
    toast('库存已调整')
    setDelta(0)
    setNote('')
    onClose()
  }

  return (
    <Dialog open={Boolean(supplement)} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>调整库存 · {supplement.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="text-muted-foreground text-sm">
            当前库存：{supplement.stockCountInUsageUnit ?? '不记录'}
            {supplement.stockCountInUsageUnit != null
              ? ` ${UNIT_TYPE_LABEL[supplement.unitType]}`
              : ''}
          </div>
          <div className="flex flex-col gap-1">
            <Label>变动量（正数为入库，负数为出库）</Label>
            <Input type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value))} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>备注</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={delta === 0}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default StockAdjustDialog
