import { useState } from 'react'
import { useIngredientSummary } from '@/hooks/useIngredientSummary'
import { formatShortDate } from '@/utils/date'
import {
  exceedsUpperLimit,
  groupTotalsBySource,
  type BatchGroup,
  type IngredientTotal,
} from '@/utils/summary'
import { cn } from 'cn'

/**
 * 当日摄入成分一览（首页 ⑧ / §6.6）。
 *
 * 展示：成分名 / 今日合计（22px）/ 上限。
 * 上限取自成分库的 `upperLimit`（**不是**参考摄入量 —— 两者是不同的数，
 * 拿推荐量当阈值会误导），留空则显示「未设上限」。
 *
 * ★ 标红是 2026-09-22 用户明确裁决的结果，**偏离 §6.6 的「超限变红」禁令**
 *   （见 docs/DECISIONS.md D-43）。上线这一版意味着：红色只表示
 *   「你自己配的上限被超过了」这一个事实，应用**不解释后果、不给建议**。
 *
 * 默认 `variant='today'` 就是这个样子（首页买单）；日历页传 `variant='calendar'`，
 * 走设计 3:318 的版式 —— 参考值并列、**不着色**，并追加「批量成分分组」。
 *
 * 口径（用户裁决）：**只累加已打卡的记录**（即打卡 + 追加 + 手动录入产生的
 * `taken=true` 记录）；含量取自该日生效的配方。
 * 设计稿原文写的是「与实际是否服用无关」，按实施指导书 §6.6 改成下面这句。
 */

export function IngredientSummaryCard({
  date,
  title = '今日摄入成分一览',
  emptyHint = '今日记录的补剂尚未关联成分',
  variant = 'today',
}: {
  date: string
  /** 日历页用「当日成分摄入」 */
  title?: string
  emptyHint?: string
  variant?: 'today' | 'calendar'
}) {
  const { totals, loading } = useIngredientSummary(date)

  if (loading) return null

  if (variant === 'calendar') {
    return (
      <CalendarSummaryCard
        date={date}
        title={title ?? '当日成分摄入'}
        emptyHint={emptyHint}
        totals={totals}
      />
    )
  }

  return <TodaySummaryCard date={date} title={title} emptyHint={emptyHint} totals={totals} />
}

/**
 * 首页 ⑧ 的版式（默认）：成分并列横排 + `upperLimit` 驱动标红（D-43）。
 */
function TodaySummaryCard({
  date,
  title,
  emptyHint,
  totals,
}: {
  date: string
  title: string
  emptyHint: string
  totals: IngredientTotal[]
}) {
  // 「没配成分的补剂不计入」必须说出来。判据早就算好了（utils/summary 的
  // missingRecipe / hasDeletedSupplement），之前一个都没渲染，用户只能看到数字
  // 悄悄不变、完全不知道为什么。
  const hasMissingRecipe = totals.some((total) => total.missingRecipe)
  const hasDeletedSupplement = totals.some((total) => total.hasDeletedSupplement)

  return (
    <section className="rounded-xl border">
      <header className="flex items-center justify-between gap-3 px-5 py-3">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-muted-foreground text-xs">按 {formatShortDate(date)} 的配方累加</span>
      </header>

      <div className="bg-border h-px" />

      {totals.length === 0 ? (
        <p className="text-muted-foreground px-5 py-4 text-xs">{emptyHint}</p>
      ) : (
        <div className="flex gap-5 px-5 py-[18px]">
          {totals.map((total, index) => {
            const over = exceedsUpperLimit(total)
            return (
              <div
                key={total.ingredientId}
                className={cn('flex min-w-0 flex-1 flex-col gap-1.5', index > 0 && 'border-l pl-5')}
              >
                <span className="text-muted-foreground truncate text-xs">{total.name}</span>
                {/* 今日合计：只有数字与单位，没有「超标 / 达标 / 剩余」这类词。
                    颜色只表达「高于你自配的上限」这一个事实（D-43），不附任何解释。 */}
                <span
                  className={cn(
                    'text-[22px] leading-[26px] font-semibold tabular-nums',
                    over && 'text-destructive',
                  )}
                >
                  {total.displayValue} {total.displayUnit}
                </span>
                <span className="text-muted-foreground text-[11px] leading-[15px] tabular-nums">
                  {/* 上限按成分自己的单位原样显示（用户在成分库里就是这么填的） */}
                  {total.upperLimit == null ? '未设上限' : `上限 ${total.upperLimit} ${total.unit}`}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div className="px-5 pt-2.5 pb-3">
        <p className="text-muted-foreground text-xs">
          只累加已打卡的记录（含追加一次与手动录入），按当日生效的配方取数。上限取自成分库，今日合计高于上限时数字标红；留空则不比较。
        </p>
        {hasMissingRecipe ? (
          <p className="text-muted-foreground mt-1 text-xs">另有补剂未关联成分，未计入以上合计。</p>
        ) : null}
        {hasDeletedSupplement ? (
          <p className="text-muted-foreground mt-1 text-xs">
            另有记录指向已删除的补剂，未计入以上合计。
          </p>
        ) : null}
      </div>
    </section>
  )
}

/**
 * 日历页版式（设计 3:318）。参考值**仅并列对照、不着色**（与首页的 upperLimit 标红相反）。
 * 另追加「批量成分分组」：把复合补剂按其贡献的成分聚成可折叠区块。
 */
function CalendarSummaryCard({
  date,
  title,
  emptyHint,
  totals,
}: {
  date: string
  title: string
  emptyHint: string
  totals: IngredientTotal[]
}) {
  const hasMissingRecipe = totals.some((total) => total.missingRecipe)
  const hasDeletedSupplement = totals.some((total) => total.hasDeletedSupplement)

  return (
    <section className="rounded-xl border">
      <header className="flex items-center justify-between gap-3 px-5 py-3">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-muted-foreground text-xs">按 {formatShortDate(date)} 的配方累加</span>
      </header>

      <div className="bg-border h-px" />

      {totals.length === 0 ? (
        <p className="text-muted-foreground px-5 py-4 text-xs">{emptyHint}</p>
      ) : (
        <div className="grid grid-cols-3 px-5 py-[18px]">
          {totals.map((total, index) => (
            <div
              key={total.ingredientId}
              className={cn(
                'flex min-w-0 flex-col gap-1.5 pr-5',
                index % 3 !== 0 && 'border-l pl-5',
              )}
            >
              <span className="text-muted-foreground truncate text-xs">{total.name}</span>
              <span className="text-[22px] leading-[26px] font-semibold tabular-nums">
                {total.displayValue} {total.displayUnit}
              </span>
              {/* 参考值仅并列，不着色、无进度条、不做任何比较（口径 4 / §6.6） */}
              <span className="text-muted-foreground text-[11px] leading-[15px] tabular-nums">
                {total.recommendedDailyIntake == null
                  ? '未设参考值'
                  : `参考 ${total.recommendedDailyIntake} ${total.unit}`}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="bg-border h-px" />

      <BatchGroups totals={totals} />

      <div className="px-5 pt-2.5 pb-3">
        <p className="text-muted-foreground text-xs">
          数值按当日打卡的补剂累加，参考值仅并列对照、高于也不着色不提示；留空即不比较。
        </p>
        {hasMissingRecipe ? (
          <p className="text-muted-foreground mt-1 text-xs">另有补剂未关联成分，未计入以上合计。</p>
        ) : null}
        {hasDeletedSupplement ? (
          <p className="text-muted-foreground mt-1 text-xs">
            另有记录指向已删除的补剂，未计入以上合计。
          </p>
        ) : null}
      </div>
    </section>
  )
}

/** 批量成分分组：单个补剂为 ≥2 种成分贡献时才渲染；空则整区不渲染。 */
function BatchGroups({ totals }: { totals: IngredientTotal[] }) {
  const groups = groupTotalsBySource(totals)
  if (groups.length === 0) return null

  return (
    <div className="flex flex-col gap-2 px-5 py-3.5">
      <span className="text-xs font-medium text-muted-foreground">批量成分分组</span>
      {groups.map((group) => (
        <BatchGroupCard key={group.supplementId} group={group} />
      ))}
    </div>
  )
}

function BatchGroupCard({ group }: { group: BatchGroup }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="rounded-lg border px-3 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2"
        aria-expanded={open}
      >
        <span className="truncate text-sm font-medium">
          {group.supplementName} · {group.itemCount} 项成分
        </span>
        <span className="text-muted-foreground shrink-0 text-xs">{open ? '收起' : '展开'}</span>
      </button>

      {open ? (
        <ul className="mt-2 divide-y">
          {group.items.map((item) => (
            <li
              key={item.ingredientId}
              className="flex items-center justify-between gap-2 py-1.5 text-xs"
            >
              <span className="text-muted-foreground truncate">{item.name}</span>
              <span className="tabular-nums shrink-0">
                {item.value} {item.displayUnit}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default IngredientSummaryCard
