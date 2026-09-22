import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { IngredientDialog } from '@/components/ingredient/IngredientDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { INGREDIENT_UNIT_LABEL } from '@/constants/units'
import {
  addLink,
  changeRecipe,
  listIngredients,
  listLinksBySupplement,
  removeLink,
} from '@/services/ingredientService'
import { useDataVersion } from '@/stores/dataVersion'
import { toast } from '@/stores/toastStore'
import type { Ingredient } from '@/types'
import { formatShortDate } from '@/utils/date'
import { cn } from 'cn'

/**
 * 补剂的「包含成分」（§8.5 / T-303）。
 *
 * 配方变更写在补剂编辑区内，不单独开页面 —— 用户的动作是「这瓶药里有什么」，
 * 分成两页就变成「先建补剂、再去另一页建配方、再回来」。
 *
 * 「改配方」不是就地改数字：原记录失效于昨天、新记录今天生效。
 * 界面上表现为**多出一行已失效记录**（降饱和），这是故意的 ——
 * 用户需要看到「我改过配方」，而不是数字被悄悄改写。
 */

interface IngredientLinksSectionProps {
  /** 新建补剂时还没有 id，先提示保存 */
  supplementId: string | null
}

function rangeLabel(from: string, to: string | null): string {
  if (to == null) return `${formatShortDate(from)} 起（当前有效）`
  return `${formatShortDate(from)} → ${formatShortDate(to)}（已失效）`
}

export function IngredientLinksSection({ supplementId }: IngredientLinksSectionProps) {
  const version = useDataVersion((s) => s.version)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [newIngredientId, setNewIngredientId] = useState('')
  const [newAmount, setNewAmount] = useState('1')
  const [ingredientDialogOpen, setIngredientDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const data = useLiveQuery(
    async () => {
      if (!supplementId) return { links: [], ingredients: [] as Ingredient[] }
      const [links, ingredients] = await Promise.all([
        listLinksBySupplement(supplementId),
        listIngredients(),
      ])
      return { links, ingredients }
    },
    [supplementId, version],
    undefined,
  )

  const ingredients = data?.ingredients ?? []
  const links = data?.links ?? []
  const ingredientMap = new Map(ingredients.map((item) => [item.id, item]))
  const currentIngredientIds = new Set(
    links.filter((link) => link.effectiveTo == null).map((link) => link.ingredientId),
  )
  const selectable = ingredients.filter((item) => !currentIngredientIds.has(item.id))

  // 下拉里新出现可选成分时自动选中，省一次点击
  useEffect(() => {
    if (selectable.length === 0) {
      setNewIngredientId('')
      return
    }
    if (!selectable.some((item) => item.id === newIngredientId)) {
      setNewIngredientId(selectable[0].id)
    }
  }, [data, newIngredientId, selectable])

  async function run(action: () => Promise<unknown>, successMessage?: string) {
    setBusy(true)
    try {
      await action()
      if (successMessage) toast(successMessage)
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  async function handleAdd() {
    if (!supplementId || !newIngredientId) return
    const amount = Number(newAmount)
    if (!Number.isInteger(amount) || amount < 0) {
      toast('每份含量必须是不小于 0 的整数', { variant: 'warning' })
      return
    }
    await run(async () => {
      await addLink({ supplementId, ingredientId: newIngredientId, amountPerServing: amount })
      setNewAmount('1')
    })
  }

  async function handleChangeRecipe(linkId: string) {
    const amount = Number(editAmount)
    if (!Number.isInteger(amount) || amount < 0) {
      toast('每份含量必须是不小于 0 的整数', { variant: 'warning' })
      return
    }
    await run(async () => {
      await changeRecipe(linkId, amount)
      setEditingId(null)
    })
  }

  if (!supplementId) {
    return (
      <div className="space-y-2">
        <Label>包含成分</Label>
        <p className="text-muted-foreground text-xs">先保存补剂，再回来关联它含哪些成分。</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Label>包含成分</Label>

      {links.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          还没有关联成分。关联之后，今日页会按已服用的记录汇总各成分的量。
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {links.map((link) => {
            const ingredient = ingredientMap.get(link.ingredientId)
            const expired = link.effectiveTo != null
            const editing = editingId === link.id
            return (
              <div
                key={link.id}
                className={cn(
                  'flex items-center justify-between gap-3 px-3 py-2',
                  // 已失效行降饱和：用户需要看到「改过配方」，不是被删掉痕迹
                  expired && 'opacity-60',
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {ingredient?.name ?? '[已删除的成分]'}
                  </p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    每份 {link.amountPerServing}{' '}
                    {ingredient ? INGREDIENT_UNIT_LABEL[ingredient.unit] : ''} ·{' '}
                    {rangeLabel(link.effectiveFrom, link.effectiveTo)}
                  </p>
                </div>

                {expired ? null : editing ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <Input
                      className="w-24"
                      type="number"
                      min={0}
                      step={1}
                      value={editAmount}
                      aria-label="每份含量"
                      onChange={(event) => setEditAmount(event.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleChangeRecipe(link.id)}
                    >
                      保存
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      取消
                    </Button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(link.id)
                        setEditAmount(String(link.amountPerServing))
                      }}
                    >
                      改配方
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busy}
                      onClick={() => void run(() => removeLink(link.id))}
                    >
                      移除
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label className="text-xs">添加成分</Label>
          <Select
            value={newIngredientId}
            onValueChange={setNewIngredientId}
            disabled={selectable.length === 0}
          >
            <SelectTrigger className="w-full" aria-label="选择成分">
              <SelectValue placeholder={ingredients.length === 0 ? '还没有成分' : '选择成分'} />
            </SelectTrigger>
            <SelectContent>
              {selectable.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}（{INGREDIENT_UNIT_LABEL[item.unit]}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-24 space-y-1.5">
          <Label className="text-xs">每份含量</Label>
          <Input
            type="number"
            min={0}
            step={1}
            value={newAmount}
            onChange={(event) => setNewAmount(event.target.value)}
          />
        </div>
        <Button
          variant="outline"
          disabled={busy || !newIngredientId}
          onClick={() => void handleAdd()}
        >
          添加
        </Button>
      </div>

      <Button size="sm" variant="ghost" onClick={() => setIngredientDialogOpen(true)}>
        新建成分
      </Button>

      {/* 新建后直接选中，用户可以立刻点「添加」，省一次找名字 */}
      <IngredientDialog
        open={ingredientDialogOpen}
        onOpenChange={setIngredientDialogOpen}
        onSaved={(created) => setNewIngredientId(created.id)}
      />
    </div>
  )
}

export default IngredientLinksSection
