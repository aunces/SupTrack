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
import { TIME_SLOT_LABEL, TIME_SLOT_VALUES, type TimeSlot } from '@/constants/enums'
import { dosagePlanRepository, supplementRepository } from '@/repositories'
import { useDataVersion } from '@/stores/dataVersion'
import { toast } from '@/stores/toastStore'
import type { DosagePlan } from '@/types'
import { newId, nowIso } from '@/utils/id'

function emptyForm(supplementId = '') {
  return {
    supplementId,
    dailyAmount: 1,
    timeSlots: ['morning'] as TimeSlot[],
    withMeal: true,
    isActive: true,
    notes: '',
  }
}

export function PlansPage() {
  const version = useDataVersion((s) => s.version)
  const rows = useLiveQuery(() => dosagePlanRepository.all(), [version], [])
  const supplements = useLiveQuery(() => supplementRepository.all(), [version], [])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<DosagePlan | null>(null)
  const [form, setForm] = useState(emptyForm())

  const nameOf = (id: string) => supplements.find((s) => s.id === id)?.name ?? '[已删除]'

  function startCreate() {
    setEditing(null)
    setForm(emptyForm(supplements[0]?.id ?? ''))
    setOpen(true)
  }

  function startEdit(row: DosagePlan) {
    setEditing(row)
    setForm({
      supplementId: row.supplementId,
      dailyAmount: row.dailyAmount,
      timeSlots: row.timeSlots,
      withMeal: row.withMeal,
      isActive: row.isActive,
      notes: row.notes ?? '',
    })
    setOpen(true)
  }

  function toggleSlot(slot: TimeSlot) {
    setForm((prev) => ({
      ...prev,
      timeSlots: prev.timeSlots.includes(slot)
        ? prev.timeSlots.filter((s) => s !== slot)
        : [...prev.timeSlots, slot],
    }))
  }

  async function save() {
    const base = {
      supplementId: form.supplementId,
      dailyAmount: form.dailyAmount,
      timeSlots: form.timeSlots,
      withMeal: form.withMeal,
      isActive: form.isActive,
      notes: form.notes.trim() || null,
    }
    try {
      if (editing) {
        await dosagePlanRepository.update(editing.id, { ...base, updatedAt: nowIso() })
        toast('已保存')
      } else {
        await dosagePlanRepository.create({
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

  async function toggleActive(row: DosagePlan) {
    await dosagePlanRepository.update(row.id, { isActive: !row.isActive, updatedAt: nowIso() })
  }

  async function remove(row: DosagePlan) {
    if (!window.confirm('删除该计划？')) return
    await dosagePlanRepository.softDelete(row.id)
    toast('已删除，可在回收站恢复')
  }

  return (
    <div className="p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">服用计划</h1>
        <Button onClick={startCreate} disabled={supplements.length === 0}>
          新增计划
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">共 {rows.length} 项</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              还没有计划。计划不保留历史版本，修改后旧值丢失。
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left text-xs">
                  <th className="py-2">补剂</th>
                  <th>每日量</th>
                  <th>时段</th>
                  <th>随餐</th>
                  <th>状态</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="py-2">{nameOf(row.supplementId)}</td>
                    <td>{row.dailyAmount}</td>
                    <td>{row.timeSlots.map((s) => TIME_SLOT_LABEL[s]).join('、')}</td>
                    <td>{row.withMeal ? '是' : '否'}</td>
                    <td>{row.isActive ? '启用' : '停用'}</td>
                    <td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(row)}>
                        {row.isActive ? '停用' : '启用'}
                      </Button>
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
            <DialogTitle>{editing ? '编辑计划' : '新增计划'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1">
              <Label>补剂</Label>
              <Select
                value={form.supplementId}
                onValueChange={(v) => setForm({ ...form, supplementId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择补剂" />
                </SelectTrigger>
                <SelectContent>
                  {supplements.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>每日服用量</Label>
              <Input
                type="number"
                min={1}
                value={form.dailyAmount}
                onChange={(e) => setForm({ ...form, dailyAmount: Number(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>随餐</Label>
              <Select
                value={form.withMeal ? 'yes' : 'no'}
                onValueChange={(v) => setForm({ ...form, withMeal: v === 'yes' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">是</SelectItem>
                  <SelectItem value="no">否</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <Label>服用时段</Label>
              <div className="flex gap-2">
                {TIME_SLOT_VALUES.map((slot) => (
                  <Button
                    key={slot}
                    type="button"
                    size="sm"
                    variant={form.timeSlots.includes(slot) ? 'default' : 'outline'}
                    onClick={() => toggleSlot(slot)}
                  >
                    {TIME_SLOT_LABEL[slot]}
                  </Button>
                ))}
              </div>
            </div>
          </div>
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

export default PlansPage
