import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Fragment, useState } from 'react'
import { PlannedIngredientSummaryCard } from '@/components/ingredient/PlannedIngredientSummaryCard'
import { IngredientDialog } from '@/components/ingredient/IngredientDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { INGREDIENT_UNIT_LABEL } from '@/constants/units'
import {
  ingredientRepository,
  supplementIngredientRepository,
  supplementRepository,
} from '@/repositories'
import { useDataVersion } from '@/stores/dataVersion'
import type { Ingredient } from '@/types'
import { formatShortDate, today } from '@/utils/date'
import { cn } from 'cn'

/**
 * 成分库（§8.5 / T-304）。
 *
 * 「来源补剂」这一列是**发现重复成分的唯一入口**：
 * 用户把「维生素D3」和「维生素 D3」写成两条时，只有在这里展开、看到
 * 「哦，原来这瓶也被算进去了」，才会意识到汇总为什么分了行。
 *
 * 系统不预置任何默认阈值 —— 参考摄入量与上限留空即「不比较」，
 * 页面上也不做任何高亮、进度条或结论。
 *
 * 2026-09-22：按设计稿 3:503 重构 —— 标题区加统计行、成分列表卡片化加分区头、
 * 并新增「每日成分汇总」卡（计划口径，只读启用计划，不读打卡）。
 */

interface SourceRow {
  linkId: string
  supplementName: string
  amountPerServing: number
  effectiveFrom: string
  effectiveTo: string | null
  isCurrent: boolean
}

interface IngredientRow {
  ingredient: Ingredient
  sources: SourceRow[]
}

export function IngredientsPage() {
  const version = useDataVersion((s) => s.version)
  const [expanded, setExpanded] = useState<string | null>(null)
  /** undefined = 关闭；null = 新建；Ingredient = 编辑 */
  const [editing, setEditing] = useState<Ingredient | null | undefined>(undefined)

  const raw = useLiveQuery(
    async () => {
      const [ingredients, links, supplements] = await Promise.all([
        ingredientRepository.all(),
        supplementIngredientRepository.all(),
        supplementRepository.all(),
      ])
      return { ingredients, links, supplements }
    },
    [version],
    undefined,
  )

  const supplementNames = new Map((raw?.supplements ?? []).map((s) => [s.id, s.name]))

  const rows: IngredientRow[] = (raw?.ingredients ?? [])
    .map((ingredient) => ({
      ingredient,
      sources: (raw?.links ?? [])
        .filter((link) => link.ingredientId === ingredient.id)
        .map((link) => ({
          linkId: link.id,
          supplementName: supplementNames.get(link.supplementId) ?? '[已删除的补剂]',
          amountPerServing: link.amountPerServing,
          effectiveFrom: link.effectiveFrom,
          effectiveTo: link.effectiveTo,
          isCurrent: link.effectiveTo == null,
        }))
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    }))
    .sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name, 'zh'))

  const loading = raw === undefined
  const ingredientCount = raw?.ingredients.length ?? 0
  const referenceCount =
    raw?.ingredients.filter((ingredient) => ingredient.recommendedDailyIntake != null).length ?? 0

  return (
    <div className="mx-auto w-full max-w-[720px] p-6">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold">成分库</h1>
          <p className="text-muted-foreground text-sm">
            {ingredientCount} 个成分 · {referenceCount} 个已设参考值 · 汇总按{' '}
            {formatShortDate(today())} 的计划与配方计算
          </p>
        </div>
        <Button onClick={() => setEditing(null)}>新建成分</Button>
      </header>

      {loading ? <LoadingSkeleton lines={4} /> : null}

      {!loading && rows.length === 0 ? (
        <EmptyState
          title="还没有成分"
          description="先建成分，再到补剂里关联「每份含多少」，成分库会出现每日成分汇总"
          action={<Button onClick={() => setEditing(null)}>新建成分</Button>}
        />
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="space-y-5">
          <section className="rounded-xl border bg-card">
            <header className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="text-sm font-medium">成分</span>
              <span className="text-muted-foreground text-xs">按名称归并</span>
            </header>
            <div className="bg-border h-px" />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>成分名</TableHead>
                  <TableHead>单位</TableHead>
                  <TableHead>参考摄入量</TableHead>
                  <TableHead>上限</TableHead>
                  <TableHead>来源补剂</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ ingredient, sources }) => {
                  const isOpen = expanded === ingredient.id
                  const currentCount = sources.filter((source) => source.isCurrent).length
                  return (
                    <Fragment key={ingredient.id}>
                      <TableRow>
                        <TableCell className="font-medium">{ingredient.name}</TableCell>
                        <TableCell>{INGREDIENT_UNIT_LABEL[ingredient.unit]}</TableCell>
                        <TableCell className="tabular-nums">
                          {ingredient.recommendedDailyIntake ?? '—'}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {ingredient.upperLimit ?? '—'}
                        </TableCell>
                        <TableCell>
                          {sources.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <button
                              type="button"
                              className="flex items-center gap-1 underline underline-offset-2"
                              aria-expanded={isOpen}
                              onClick={() => setExpanded(isOpen ? null : ingredient.id)}
                            >
                              {sources.length} 个
                              {isOpen ? (
                                <ChevronDown className="size-3.5" />
                              ) : (
                                <ChevronRight className="size-3.5" />
                              )}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditing(ingredient)}
                          >
                            编辑
                          </Button>
                        </TableCell>
                      </TableRow>

                      {isOpen ? (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/40">
                            <p className="mb-2 text-xs font-medium">
                              {ingredient.name} 被以下补剂包含：
                            </p>
                            <ul className="space-y-1">
                              {sources.map((source) => (
                                <li
                                  key={source.linkId}
                                  className={cn(
                                    'text-xs tabular-nums',
                                    source.isCurrent ? '' : 'text-muted-foreground',
                                  )}
                                >
                                  · {source.supplementName} · 每份 {source.amountPerServing}{' '}
                                  {INGREDIENT_UNIT_LABEL[ingredient.unit]} · 生效{' '}
                                  {formatShortDate(source.effectiveFrom)} 起（
                                  {source.isCurrent ? '当前有效' : '已失效'}）
                                </li>
                              ))}
                            </ul>
                            {currentCount === 0 ? (
                              <p className="text-muted-foreground mt-2 text-xs">
                                当前没有任何补剂在用它。
                              </p>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </section>

          <PlannedIngredientSummaryCard />
        </div>
      ) : null}

      <IngredientDialog
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined)
        }}
        ingredient={editing ?? null}
      />
    </div>
  )
}

export default IngredientsPage
