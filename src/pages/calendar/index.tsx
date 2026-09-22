import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BackfillDialog } from '@/components/backfill/BackfillDialog'
import { StateLine, StateSwatch } from '@/components/common/ItemStateView'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { IngredientSummaryCard } from '@/components/today/IngredientSummaryCard'
import { Button } from '@/components/ui/button'
import { UNIT_TYPE_LABEL } from '@/constants/units'
import { useCalendarMonth } from '@/hooks/useCalendarMonth'
import { useTodayData } from '@/hooks/useTodayData'
import { listBackfillableItems } from '@/services/backfillService'
import { useDataVersion } from '@/stores/dataVersion'
import type { CalendarDay, CalendarDot } from '@/utils/calendar'
import { backfillRange, formatDateLabel, formatShortDate, today } from '@/utils/date'
import { resolveDayStatus, type DayItem } from '@/utils/dayState'
import { cn } from 'cn'

/**
 * 日历页（§8.4 / T-204）—— 回看与补录。
 *
 * 左右并排、右侧详情常驻：PC 上「点一下 → 看明细」不该跳页或开抽屉，
 * 用户的动作是「快速扫一遍过去两周，找出哪天没记」，抽屉会打断这个节奏。
 *
 * 今日用**边框加粗**而不是填充色：填充色已经被「已服用」的绿色占用，
 * 再用一次就会让「今天」和「这天吃完了」看起来是同一件事。
 *
 * 日级状态（done / partial / missed / rest / paused）全部是现算的，库里没有这些字段 ——
 * 所以「补录一条漏服」之后不需要更新任何状态位，重算一遍就对了。
 */

const WEEKDAY_HEADER = ['一', '二', '三', '四', '五', '六', '日'] as const

/**
 * 月历格的状态点。
 * 这一层是**缩略视图**：格子只有 ~44px，完整的四态形状语言（对勾 / 虚线 / 斜纹）
 * 留给右侧详情与今日页；这里用「圆 / 方」两个形状 + 颜色承担区分。
 */
const DOT_CLASS: Record<CalendarDot, string> = {
  pending: 'rounded-full bg-amber-500',
  taken: 'rounded-full bg-emerald-500',
  rest: 'rounded-full border border-dashed border-slate-400',
  paused: 'rounded-[2px] bg-violet-500',
  /** 漏服 = 过去的应服项还没记录。橙红描边区别于「待服用」的琥珀实心 */
  missed: 'rounded-full border-[1.5px] border-amber-600',
}

function Dot({ kind, className }: { kind: CalendarDot; className?: string }) {
  return <span className={cn('inline-block size-1.5', DOT_CLASS[kind], className)} aria-hidden />
}

const LEGEND: Array<{ label: string; render: () => React.ReactNode }> = [
  { label: '待服用', render: () => <Dot kind="pending" /> },
  { label: '已服用', render: () => <Dot kind="taken" /> },
  {
    label: '部分完成',
    render: () => (
      <>
        <Dot kind="taken" />
        <Dot kind="missed" />
      </>
    ),
  },
  { label: '漏服', render: () => <Dot kind="missed" /> },
  { label: '今天休息', render: () => <Dot kind="rest" /> },
  { label: '停用', render: () => <Dot kind="paused" /> },
]

function DayCell({
  day,
  isSelected,
  onSelect,
}: {
  day: CalendarDay
  isSelected: boolean
  onSelect: (date: string) => void
}) {
  // 未来灰显、不可点（§8.4）；邻月补位格同属「不在这个月」，一并不可点
  const disabled = !day.inMonth || day.isFuture

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(day.date)}
      aria-label={day.date}
      aria-current={day.isToday ? 'date' : undefined}
      className={cn(
        'flex h-11 flex-col items-center justify-center gap-1 rounded-md border text-xs transition-colors',
        // 今日边框加粗，其余保持透明边框占位，避免选中时格子跳动
        day.isToday ? 'border-2 border-foreground/70 font-semibold' : 'border-transparent',
        disabled ? 'text-muted-foreground/40 cursor-default' : 'hover:bg-accent/60',
        isSelected && !disabled ? 'bg-accent' : '',
      )}
    >
      <span className="tabular-nums leading-none">{day.day}</span>
      <span className="flex h-1.5 items-center gap-0.5">
        {day.dots.map((dot, index) => (
          <Dot key={index} kind={dot} />
        ))}
        {day.hiddenDotCount > 0 ? (
          <span className="text-muted-foreground text-[10px] leading-none">
            +{day.hiddenDotCount}
          </span>
        ) : null}
      </span>
    </button>
  )
}

/** 详情里的一条：与今日页**同一个** StateLine，只是没有操作按钮（过去的事不该有打卡入口） */
function DetailRow({ item }: { item: DayItem }) {
  const unit = item.supplement ? UNIT_TYPE_LABEL[item.supplement.unitType] : '份'
  return (
    <div className="flex items-start gap-2.5 px-4 py-2.5">
      <span className="grid h-5 shrink-0 place-items-center">
        <StateSwatch state={item.state} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.supplement?.name ?? '[已删除的补剂]'}</p>
        <p className="text-muted-foreground truncate text-xs">
          <StateLine item={item} unit={unit} />
        </p>
      </div>
    </div>
  )
}

/**
 * 底部补录入口，四种互斥情况（§8.4 表格）。
 * 顺序有讲究：先判这天「本来就不该吃」（休息 / 停用），再说窗口，最后才是有没有可补的项 ——
 * 否则休息日会被说成「超出补录窗口」，用户会以为是时间问题而不是这天本来不用吃。
 */
function BackfillEntry({
  date,
  status,
  pausedItem,
  candidateCount,
  onOpen,
}: {
  date: string
  status: ReturnType<typeof resolveDayStatus>
  pausedItem: DayItem | undefined
  candidateCount: number
  onOpen: () => void
}) {
  const { min } = backfillRange()
  const now = today()

  // 今天与未来：今天的动作在今日页，过去 7 天之外的走下面的窗口提示
  if (date >= now) return null

  if (status === 'rest') {
    return <p className="text-muted-foreground text-xs">今日休息</p>
  }

  if (status === 'paused') {
    const resume = pausedItem?.pause?.resumeDate
    return (
      <p className="text-muted-foreground text-xs">
        停用中 · {resume ? `${formatShortDate(resume)} 恢复` : '持续中'}
      </p>
    )
  }

  if (date < min) {
    return <p className="text-muted-foreground text-xs">超出补录窗口</p>
  }

  if (candidateCount === 0) return null

  return (
    <Button size="sm" variant="outline" onClick={onOpen}>
      + 补录一条
    </Button>
  )
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

export function CalendarPage() {
  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [selected, setSelected] = useState(today())
  const [backfillOpen, setBackfillOpen] = useState(false)

  const { days, loading } = useCalendarMonth(cursor.year, cursor.month)
  const detail = useTodayData(selected)
  const version = useDataVersion((s) => s.version)

  const candidates = useLiveQuery(
    () => listBackfillableItems(selected),
    [selected, version],
    undefined,
  )

  const detailItems = useMemo(
    () => [...detail.groups.flatMap((group) => group.items), ...detail.extraItems],
    [detail.groups, detail.extraItems],
  )
  const status = resolveDayStatus(detailItems)
  const pausedItem = detailItems.find((item) => item.state === 'paused')

  function goToday() {
    const current = new Date()
    setCursor({ year: current.getFullYear(), month: current.getMonth() + 1 })
    setSelected(today())
  }

  return (
    <div className="mx-auto w-full max-w-[720px] p-6">
      <h1 className="mb-4 text-xl font-semibold">日历</h1>

      <div className="flex items-start gap-4">
        <section className="min-w-0 flex-1">
          <header className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label="上个月"
                onClick={() => setCursor(shiftMonth(cursor.year, cursor.month, -1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-[92px] text-center text-sm font-medium tabular-nums">
                {cursor.year} 年 {cursor.month} 月
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="下个月"
                onClick={() => setCursor(shiftMonth(cursor.year, cursor.month, 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={goToday}>
              回到今天
            </Button>
          </header>

          {loading ? (
            <LoadingSkeleton lines={5} />
          ) : (
            <>
              <div className="text-muted-foreground mb-1 grid grid-cols-7 gap-1 text-center text-xs">
                {WEEKDAY_HEADER.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {days.map((day) => (
                  <DayCell
                    key={day.date}
                    day={day}
                    isSelected={day.date === selected}
                    onSelect={setSelected}
                  />
                ))}
              </div>

              <ul className="text-muted-foreground mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs">
                {LEGEND.map((entry) => (
                  <li key={entry.label} className="flex items-center gap-1">
                    <span className="flex items-center gap-0.5">{entry.render()}</span>
                    {entry.label}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* 详情常驻：不跳页、不开抽屉 */}
        <aside className="w-[272px] shrink-0">
          <div className="bg-card rounded-xl border">
            <header className="border-b px-4 py-2.5">
              <p className="text-sm font-medium">{formatDateLabel(selected)}</p>
              {/* 与今日页同一套三个数字（§8.1 P4）：第三个不进任何分母 */}
              <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                待吃 {detail.summary.pending} · 已吃 {detail.summary.taken} · 今天不用吃{' '}
                {detail.summary.off}
              </p>
            </header>

            <div className="divide-y">
              {detail.loading ? (
                <p className="text-muted-foreground px-4 py-6 text-center text-xs">读取中…</p>
              ) : detailItems.length === 0 ? (
                <p className="text-muted-foreground px-4 py-6 text-center text-xs">这天没有记录</p>
              ) : (
                detailItems.map((item) => (
                  <DetailRow
                    key={`${item.supplementId}-${item.timeSlot}-${item.planId}-${item.recordIds.join(',')}`}
                    item={item}
                  />
                ))
              )}
            </div>

            <footer className="border-t px-4 py-2.5 empty:hidden">
              <BackfillEntry
                date={selected}
                status={status}
                pausedItem={pausedItem}
                candidateCount={candidates?.length ?? 0}
                onOpen={() => setBackfillOpen(true)}
              />
            </footer>
          </div>

          {/* 当日成分摄入（§8.4 设计稿）。放在日历上不只是「回看数字」——
              它是「漏服不计入汇总」这条口径唯一能被用户看见的地方（走查第 21 步）。 */}
          <IngredientSummaryCard
            date={selected}
            title="当日成分摄入"
            emptyHint="这天记录的补剂尚未关联成分"
          />
        </aside>
      </div>

      <BackfillDialog open={backfillOpen} onOpenChange={setBackfillOpen} defaultDate={selected} />
    </div>
  )
}

export default CalendarPage
