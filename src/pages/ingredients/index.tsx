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
import { INGREDIENT_UNIT_VALUES, type IngredientUnit } from '@/constants/units'
import { ingredientRepository } from '@/repositories'
import { useDataVersion } from '@/stores/dataVersion'
import { toast } from '@/stores/toastStore'
import type { Ingredient } from '@/types'
import { newId } from '@/utils/id'

function emptyForm() {
  return {
    name: '',
    unit: 'mg' as IngredientUnit,
    recommendedDailyIntake: '',
    upperLimit: '',
    description: '',
  }
}

export function IngredientsPage() {
  const version = useDataVersion((s) => s.version)
  const rows = useLiveQuery(() => ingredientRepository.all(), [version], [])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [form, setForm] = useState(emptyForm())

  function startCreate() {
    setEditing(null)
    setForm(emptyForm())
    setOpen(true)
  }

  function startEdit(row: Ingredient) {
    setEditing(row)
    setForm({
      name: row.name,
      unit: row.unit,
      recommendedDailyIntake:
        row.recommendedDailyIntake == null ? '' : String(row.recommendedDailyIntake),
      upperLimit: row.upperLimit == null ? '' : String(row.upperLimit),
      description: row.description ?? '',
    })
    setOpen(true)
  }

  async function save() {
    const base = {
      name: form.name.trim(),
      unit: form.unit,
      recommendedDailyIntake: form.recommendedDailyIntake
        ? Number(form.recommendedDailyIntake)
        : null,
      upperLimit: form.upperLimit ? Number(form.upperLimit) : null,
      description: form.description.trim() || null,
    }
    try {
      if (editing) {
        await ingredientRepository.update(editing.id, base)
        toast('已保存')
      } else {
        await ingredientRepository.create({ id: newId(), ...base, deletedAt: 0 })
        toast('已创建')
      }
      setOpen(false)
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    }
  }

  async function remove(row: Ingredient) {
    if (!window.confirm(`删除成分「${row.name}」？`)) return
    await ingredientRepository.softDelete(row.id)
    toast('已删除，可在回收站恢复')
  }

  return (
    <div className="p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">成分库</h1>
        <Button onClick={startCreate}>新增成分</Button>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">共 {rows.length} 项</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">还没有成分。</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left text-xs">
                  <th className="py-2">名称</th>
                  <th>单位</th>
                  <th>推荐量</th>
                  <th>上限</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="py-2">{row.name}</td>
                    <td>{row.unit}</td>
                    <td>{row.recommendedDailyIntake ?? '-'}</td>
                    <td>{row.upperLimit ?? '-'}</td>
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
            <DialogTitle>{editing ? '编辑成分' : '新增成分'}</DialogTitle>
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
              <Label>单位（mcg 会自动转为 μg）</Label>
              <Select
                value={form.unit}
                onValueChange={(v) => setForm({ ...form, unit: v as IngredientUnit })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INGREDIENT_UNIT_VALUES.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>推荐每日摄入量</Label>
              <Input
                type="number"
                value={form.recommendedDailyIntake}
                onChange={(e) => setForm({ ...form, recommendedDailyIntake: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>每日上限</Label>
              <Input
                type="number"
                value={form.upperLimit}
                onChange={(e) => setForm({ ...form, upperLimit: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>备注</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
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

export default IngredientsPage
