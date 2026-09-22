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
import {
  INGREDIENT_UNIT_LABEL,
  INGREDIENT_UNIT_VALUES,
  type IngredientUnit,
} from '@/constants/units'
import { countLinks, createIngredient, updateIngredient } from '@/services/ingredientService'
import { toast } from '@/stores/toastStore'
import type { Ingredient } from '@/types'

/**
 * 成分编辑（§8.5 / T-304）。
 *
 * 三件必须写进界面的话：
 * 1. 「跨补剂归并按名称匹配」—— 用户把「维生素D3」和「维生素 D3」写成两种，
 *    汇总就会分成两行，而他完全不知道为什么。
 * 2. 「IU 与 ml 独立累加，不与 μg 混算」—— 单位选错不会报错，只会静默算错。
 * 3. 「留空 = 不比较」—— 系统**不预置任何默认阈值**，这是产品对「不下结论」的承诺。
 *
 * W-08 的改名提示不用警告色：关联走 `ingredientId`，改名根本不会断开关联，
 * 用警告色只会制造一场虚惊。
 */

interface IngredientDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 传入则为编辑 */
  ingredient?: Ingredient | null
  /** 新建成功后回调（补剂编辑区内「新建成分并关联」要用） */
  onSaved?: (ingredient: Ingredient) => void
}

export function IngredientDialog({
  open,
  onOpenChange,
  ingredient,
  onSaved,
}: IngredientDialogProps) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState<IngredientUnit>('mg')
  const [recommended, setRecommended] = useState('')
  const [upperLimit, setUpperLimit] = useState('')
  const [notes, setNotes] = useState('')
  const [linkCount, setLinkCount] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(ingredient?.name ?? '')
    setUnit(ingredient?.unit ?? 'mg')
    setRecommended(
      ingredient?.recommendedDailyIntake == null ? '' : String(ingredient.recommendedDailyIntake),
    )
    setUpperLimit(ingredient?.upperLimit == null ? '' : String(ingredient.upperLimit))
    setNotes(ingredient?.notes ?? '')
    setSaving(false)

    if (ingredient) {
      void countLinks(ingredient.id).then(setLinkCount)
    } else {
      setLinkCount(0)
    }
  }, [open, ingredient])

  /** 空串 → null（留空即「不比较」）；非法输入交给 Zod 兜底 */
  function parseOptionalInt(value: string): number | null {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  const renamed = ingredient != null && name.trim() !== ingredient.name

  async function handleSubmit() {
    if (name.trim() === '') {
      toast('请填写成分名称', { variant: 'warning' })
      return
    }

    const draft = {
      name: name.trim(),
      unit,
      recommendedDailyIntake: parseOptionalInt(recommended),
      upperLimit: parseOptionalInt(upperLimit),
      notes: notes.trim() === '' ? null : notes.trim(),
    }

    setSaving(true)
    try {
      if (ingredient) {
        await updateIngredient(ingredient.id, draft)
      } else {
        const created = await createIngredient(draft)
        onSaved?.(created)
      }
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
          <DialogTitle>{ingredient ? '编辑成分' : '新建成分'}</DialogTitle>
          <DialogDescription>跨补剂归并按名称匹配，请与瓶子上的写法保持一致。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ingredient-name">成分名 *</Label>
            <Input
              id="ingredient-name"
              value={name}
              placeholder="例如：维生素 D3"
              onChange={(event) => setName(event.target.value)}
            />
            {renamed && linkCount > 0 ? (
              // W-08：不用警告色 —— 关联走 ingredientId，改名不会断
              <p className="text-muted-foreground text-xs">
                已有 {linkCount} 个补剂关联此成分，改名后仍指向同一成分
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ingredient-unit">单位 *</Label>
            <Select value={unit} onValueChange={(value) => setUnit(value as IngredientUnit)}>
              <SelectTrigger id="ingredient-unit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INGREDIENT_UNIT_VALUES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {INGREDIENT_UNIT_LABEL[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">IU 与 ml 独立累加，不与 μg 混算</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ingredient-recommended">参考摄入量</Label>
              <Input
                id="ingredient-recommended"
                type="number"
                min={0}
                step={1}
                value={recommended}
                onChange={(event) => setRecommended(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">留空 = 不做比较</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ingredient-upper">上限</Label>
              <Input
                id="ingredient-upper"
                type="number"
                min={0}
                step={1}
                value={upperLimit}
                onChange={(event) => setUpperLimit(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">留空 = 不显示</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ingredient-notes">备注（可留空）</Label>
            <Input
              id="ingredient-notes"
              value={notes}
              placeholder="例如：随餐吸收更好"
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          {/* 系统不预置任何默认阈值，这里是产品对「不下结论」的承诺 */}
          <p className="text-muted-foreground text-xs">
            参考值与上限只与你今天的合计并列显示，应用不会据此给出任何建议。
          </p>
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

export default IngredientDialog
