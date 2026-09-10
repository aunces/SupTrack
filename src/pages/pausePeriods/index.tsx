import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { CYCLE_MODE_LABEL, CYCLE_MODE_VALUES, type CycleMode } from '@/constants/enums'
import { pausePeriodRepository, supplementRepository } from '@/repositories'
import { toast } from '@/stores/toastStore'
import type { PausePeriod } from '@/types'
import { newId, nowIso } from '@/utils/id'
import { today } from '@/utils/date'

function emptyForm() {
  return {
    supplementId: 'global',
    startDate: today(),
    endDate: '',
    reason: '',
    cycleMode: 'none' as CycleMode,
    cycleStartDate: '',
    cycleOnDays: '',
    cycleOffDays: '',
  }
}

export function PausePeriodsPage() {
  const rows = useLiveQuery(() => pausePeriodRepository.all(), [], [])
  const supplements = useLiveQuery(() => supplementRepository.all(), [], [])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PausePeriod | null>(null)
  const [form, setForm] = useState(emptyForm())

  const nameOf = (id: string | null) =>
    id == null ? '全局' : (supplements.find((s) => s.id === id)?.name ?? '[已删除]')

  function startCreate() {
    setEditing(null)
    setForm(emptyForm())
    setOpen(true)
  }

  function startEdit(row: PausePeriod) {
    setEditing(row)
    setForm({
      supplementId: row.supplementId ?? 'global',
      startDate: row.startDate,
      endDate: row.endDate ?? '',
      reason: row.reason ?? '',
      cycleMode: row.cycleMode,
      cycleStartDate: row.cycleStartDate ?? '',
      cycleOnDays: row.cycleOnDays == null ? '' : String(row.cycleOnDays),
      cycleOffDays: row.cycleOffDays == null ? '' : String(row.cycleOffDays),
    })
    setOpen(true)
  }

  async function save() {
    const base = {
      supplementId: form.supplementId === 'global' ? null : form.supplementId,
      startDate: form.startDate,
      endDate: form.endDate || null,
      reason: form.reason.trim() || null,
      cycleMode: form.cycleMode,
      cycleStartDate: form.cycleMode === 'cyclic' ? form.startDate : null,
      cycleOnDays:
        form.cycleMode === 'cyclic' && form.cycleOnDays ? Number(form.cycleOnDays) : null,
      cycleOffDays:
        form.cycleMode === 'cyclic' && form.cycleOffDays ? Number(form.cycleOffDays) : null,
    }
    try {
      if (editing) {
        await pausePeriodRepository.update(editing.id, { ...base, updatedAt: nowIso() })
        toast('已保存')
      } else {
        await pausePeriodRepository.create({
          id: newId(),
          ...base,
          deletedAt: 0,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        })
        toast('已创建')
      }
      setOpen(false)
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    }
  }

  async function remove(row: PausePeriod) {
    if (!window.confirm('删除该停药期？')) return
    await pausePeriodRepository.softDelete(row.id)
    toast('已删除，可在回收站恢复')
  }

  return (
    <div className="p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">停药期</h1>
        <Button onClick={startCreate}>新增停药期</Button>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">共 {rows.length} 项（补剂级与全局取并集）</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">当前没有生效的停药期。</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left text-xs">
                  <th className="py-2">范围</th>
                  <th>开始</th>
                  <th>结束</th>
                  <th>模式</th>
                  <th>原因</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="py-2">{nameOf(row.supplementId ?? null)}</td>
                    <td>{row.startDate}</td>
                    <td>{row.endDate ?? '持续中'}</td>
                    <td>
                      {CYCLE_MODE_LABEL[row.cycleMode]}
                      {row.cycleMode === 'cyclic'
                        ? `（吃 ${row.cycleOnDays} 停 ${row.cycleOffDays}）`
                        : ''}
                    </td>
                    <td>{row.reason ?? '-'}</td>
                    <td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(row)}>
                        编辑
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(row)}>
                        删除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? '编辑停药期' : '新增停药期'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1">
              <Label>范围</Label>
              <Select
                value={form.supplementId}
                onValueChange={(v) => setForm({ ...form, supplementId: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">全局停药</SelectItem>
                  {supplements.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>开始日期</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>结束日期（可空）</Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <Label>模式</Label>
              <Select
                value={form.cycleMode}
                onValueChange={(v) => setForm({ ...form, cycleMode: v as CycleMode })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CYCLE_MODE_VALUES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {CYCLE_MODE_LABEL[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.cycleMode === 'cyclic' && (
              <>
                <div className="flex flex-col gap-1">
                  <Label>周期锚点</Label>
                  <Input
                    type="date"
                    value={form.cycleStartDate || form.startDate}
                    onChange={(e) => setForm({ ...form, cycleStartDate: e.target.value })}
                  />
                </div>
                <div />
                <div className="flex flex-col gap-1">
                  <Label>服用天数</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.cycleOnDays}
                    onChange={(e) => setForm({ ...form, cycleOnDays: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>停药天数</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.cycleOffDays}
                    onChange={(e) => setForm({ ...form, cycleOffDays: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="col-span-2 flex flex-col gap-1">
              <Label>原因</Label>
              <Input
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            修改周期参数只影响未来计算，已产生的记录不受影响。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={save}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default PausePeriodsPage
