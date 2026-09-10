import { useLiveQuery } from 'dexie-react-hooks'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { db } from '@/db'
import { ingredientRepository, supplementIngredientRepository } from '@/repositories'
import { toast } from '@/stores/toastStore'
import type { Supplement } from '@/types'
import { newId, nowIso } from '@/utils/id'
import { formatDate, today, yesterday } from '@/utils/date'

interface Props {
  supplement: Supplement | null
  onClose: () => void
}

export function IngredientLinksDialog({ supplement, onClose }: Props) {
  const links = useLiveQuery(
    () =>
      supplement
        ? supplementIngredientRepository.listBySupplement(supplement.id, true)
        : Promise.resolve([]),
    [supplement?.id],
    [],
  )
  const ingredients = useLiveQuery(() => ingredientRepository.all(), [], [])
  const [ingredientId, setIngredientId] = useState('')
  const [amount, setAmount] = useState(1)

  if (!supplement) return null

  async function addLink() {
    if (!supplement || !ingredientId) return
    const now = nowIso()
    try {
      await db.transaction('rw', db.supplementIngredients, async () => {
        const existing = await supplementIngredientRepository.effectiveAt(
          supplement.id,
          today(),
          true,
        )
        const same = existing.find((l) => l.ingredientId === ingredientId)
        if (same) {
          // 配方变更：旧版本失效于昨日，新版本自今日生效
          await db.supplementIngredients.update(same.id, {
            effectiveTo: yesterday(),
            updatedAt: now,
          })
        }
        await supplementIngredientRepository.create({
          id: newId(),
          supplementId: supplement.id,
          ingredientId,
          amountPerServing: amount,
          effectiveFrom: today(),
          effectiveTo: null,
          deletedAt: 0,
          createdAt: now,
          updatedAt: now,
        })
      })
      toast('已关联')
      setIngredientId('')
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    }
  }

  async function removeLink(id: string) {
    await supplementIngredientRepository.softDelete(id)
    toast('已移除关联')
  }

  const ingredientOf = (id: string) => ingredients.find((i) => i.id === id)

  return (
    <Dialog open={Boolean(supplement)} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>成分关联 · {supplement.name}</DialogTitle>
        </DialogHeader>

        <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto text-sm">
          {(links ?? []).length === 0 ? (
            <li className="text-muted-foreground py-4 text-center">暂无关联成分</li>
          ) : (
            (links ?? []).map((link) => {
              const ingredient = ingredientOf(link.ingredientId)
              return (
                <li key={link.id} className="flex items-center justify-between border-b py-1">
                  <span>
                    {ingredient?.name ?? link.ingredientId} · {link.amountPerServing}{' '}
                    {ingredient?.unit ?? ''}
                    <span className="text-muted-foreground ml-1 text-xs">
                      （{link.effectiveFrom} ~ {link.effectiveTo ?? '至今'}
                      {link.deletedAt !== 0 ? ' · 已删除' : ''}）
                    </span>
                  </span>
                  {link.deletedAt === 0 && (
                    <Button size="sm" variant="ghost" onClick={() => removeLink(link.id)}>
                      移除
                    </Button>
                  )}
                </li>
              )
            })
          )}
        </ul>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label>成分</Label>
            <Select value={ingredientId} onValueChange={setIngredientId}>
              <SelectTrigger>
                <SelectValue placeholder="选择成分" />
              </SelectTrigger>
              <SelectContent>
                {ingredients.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}（{item.unit}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-28">
            <Label>每份含量（{ingredientOf(ingredientId)?.unit ?? '单位'}）</Label>
            <Input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          修改配方会保留历史版本（旧版本失效于 {formatDate(new Date())}{' '}
          的前一天），成分汇总按日期匹配当时配方。
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
          <Button onClick={addLink}>添加关联</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default IngredientLinksDialog
