import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
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
import {
  SUPPLEMENT_STATUS_LABEL,
  SUPPLEMENT_STATUS_VALUES,
  type SupplementStatus,
} from '@/constants/enums'
import { UNIT_TYPE_LABEL, UNIT_TYPE_VALUES, type UnitType } from '@/constants/units'
import { supplementRepository } from '@/repositories'
import { useDataVersion } from '@/stores/dataVersion'
import { toast } from '@/stores/toastStore'
import type { Supplement } from '@/types'
import { newId, nowIso } from '@/utils/id'
import { isExpiringSoon } from '@/utils/date'
import { IngredientLinksDialog } from './IngredientLinksDialog'
import { StockAdjustDialog } from './StockAdjustDialog'

function emptyForm() {
  return {
    name: '',
    brand: '',
    unitType: 'capsule' as UnitType,
    stockCountInUsageUnit: '',
    stockUnit: '',
    unitsPerStock: '',
    expiryDate: '',
    status: 'active' as SupplementStatus,
  }
}

export function SupplementsPage() {
  const version = useDataVersion((s) => s.version)
  const rows = useLiveQuery(() => supplementRepository.all(), [version], [])

  const [editing, setEditing] = useState<Supplement | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [open, setOpen] = useState(false)
  const [linksFor, setLinksFor] = useState<Supplement | null>(null)
  const [stockFor, setStockFor] = useState<Supplement | null>(null)

  function startCreate() {
    setEditing(null)
    setForm(emptyForm())
    setOpen(true)
  }

  function startEdit(row: Supplement) {
    setEditing(row)
    setForm({
      name: row.name,
      brand: row.brand ?? '',
      unitType: row.unitType,
      stockCountInUsageUnit:
        row.stockCountInUsageUnit == null ? '' : String(row.stockCountInUsageUnit),
      stockUnit: row.stockUnit ?? '',
      unitsPerStock: row.unitsPerStock == null ? '' : String(row.unitsPerStock),
      expiryDate: row.expiryDate ?? '',
      status: row.status,
    })
    setOpen(true)
  }

  async function save() {
    const base = {
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      unitType: form.unitType,
      stockCountInUsageUnit:
        form.stockCountInUsageUnit === '' ? null : Number(form.stockCountInUsageUnit),
      stockUnit: form.stockUnit.trim() || null,
      unitsPerStock: form.unitsPerStock === '' ? null : Number(form.unitsPerStock),
      expiryDate: form.expiryDate || null,
      status: form.status,
    }
    try {
      if (editing) {
        await supplementRepository.update(editing.id, { ...base, updatedAt: nowIso() })
        toast('已保存')
      } else {
        await supplementRepository.create({
          id: newId(),
          ...base,
          description: null,
          productionDate: null,
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

  async function remove(row: Supplement) {
    if (!window.confirm(`删除「${row.name}」会同时停用其服用计划与成分关联，确认删除？`)) return
    await supplementRepository.softDeleteCascade(row.id)
    toast('已删除，可在回收站恢复')
  }

  return (
    <div className="p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">补剂库</h1>
        <Button onClick={startCreate}>新增补剂</Button>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">共 {rows.length} 项</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              还没有补剂，点击右上角新增。
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left text-xs">
                  <th className="py-2">名称</th>
                  <th>库存</th>
                  <th>单位</th>
                  <th>过期</th>
                  <th>状态</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="py-2">{row.name}</td>
                    <td>
                      {row.stockCountInUsageUnit == null ? (
                        <span className="text-muted-foreground">不记录</span>
                      ) : (
                        <span
                          className={
                            row.stockCountInUsageUnit < 0 ? 'text-destructive font-medium' : ''
                          }
                        >
                          {row.stockCountInUsageUnit}
                          {row.stockUnit && row.unitsPerStock
                            ? `（约 ${(row.stockCountInUsageUnit / row.unitsPerStock).toFixed(2)} ${row.stockUnit}）`
                            : ''}
                        </span>
                      )}
                    </td>
                    <td>{UNIT_TYPE_LABEL[row.unitType]}</td>
                    <td>
                      {row.expiryDate ? (
                        <span className={isExpiringSoon(row.expiryDate) ? 'text-amber-600' : ''}>
                          {row.expiryDate}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      <Badge variant="secondary">{SUPPLEMENT_STATUS_LABEL[row.status]}</Badge>
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setStockFor(row)}>
                          调库存
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setLinksFor(row)}>
                          成分
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(row)}>
                          编辑
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(row)}>
                          删除
                        </Button>
                      </div>
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
            <DialogTitle>{editing ? '编辑补剂' : '新增补剂'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1">
              <Label>名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>品牌</Label>
              <Input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>服用单位</Label>
              <Select
                value={form.unitType}
                onValueChange={(v) => setForm({ ...form, unitType: v as UnitType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_TYPE_VALUES.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {UNIT_TYPE_LABEL[unit]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>库存数量（按服用单位计，可空）</Label>
              <Input
                type="number"
                value={form.stockCountInUsageUnit}
                onChange={(e) => setForm({ ...form, stockCountInUsageUnit: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>过期日期</Label>
              <Input
                type="date"
                value={form.expiryDate}
                onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>库存展示单位（如 瓶 / 盒 / 袋，可空）</Label>
              <Input
                value={form.stockUnit}
                placeholder="留空则只显示服用单位"
                onChange={(e) => setForm({ ...form, stockUnit: e.target.value })}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <Label>
                换算率：1 {form.stockUnit.trim() || '展示单位'} = 多少{' '}
                {UNIT_TYPE_LABEL[form.unitType]}
              </Label>
              <Input
                type="number"
                min={1}
                placeholder="例：1 瓶 = 60 粒，则填 60"
                value={form.unitsPerStock}
                onChange={(e) => setForm({ ...form, unitsPerStock: e.target.value })}
              />
              <p className="text-muted-foreground text-xs">
                {form.stockUnit.trim() && form.unitsPerStock && form.stockCountInUsageUnit !== ''
                  ? `将显示：${form.stockCountInUsageUnit} ${UNIT_TYPE_LABEL[form.unitType]} / 约 ${(
                      Number(form.stockCountInUsageUnit) / Number(form.unitsPerStock)
                    ).toFixed(2)} ${form.stockUnit.trim()}`
                  : '只用于"折合几瓶"的显示，不参与库存扣减；不填展示单位时可留空。'}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <Label>状态</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as SupplementStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPLEMENT_STATUS_VALUES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {SUPPLEMENT_STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      <IngredientLinksDialog supplement={linksFor} onClose={() => setLinksFor(null)} />
      <StockAdjustDialog supplement={stockFor} onClose={() => setStockFor(null)} />
    </div>
  )
}

export default SupplementsPage
