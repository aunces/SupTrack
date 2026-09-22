import { type ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { DayListItem } from '@/components/today/DayListItem'
import { ManualIntakeDialog } from '@/components/today/ManualIntakeDialog'
import {
  DENSE_COLLAPSE_THRESHOLD,
  INTAKE_ORIGIN,
  INTAKE_ORIGIN_LABEL,
  TIME_SLOT_LABEL,
} from '@/constants/enums'
import { UNIT_TYPE_LABEL } from '@/constants/units'
import { useTodayData, type TodayGroup, type TodayWarnings } from '@/hooks/useTodayData'
import { exportToFile } from '@/services/importExportService'
import { undoIntake } from '@/services/intakeService'
import { toast } from '@/stores/toastStore'
import { formatDateLabel } from '@/utils/date'
import type { DayItem } from '@/utils/dayState'

/**
 * 今日页（§8.1）★ 全产品价值集中在这一屏。
 *
 * 目标：打开 5 秒内知道今天吃什么 → 点一下完成记录 → 不跳转、不滚动、不弹窗。
 *
 * 明确不做（别顺手加上）：
 *   ❌ 日期切换（回看是日历页的职责）  ❌ 完成度百分比 / 进度环
 *   ❌ 庆祝动效 / 连续打卡天数 / 健康评分  ❌ 「今天先不吃」快捷入口
 */

/** 分组容器：用 div 而不是 Card，是为了压住 Card 默认的 py-6 / gap-6（信息密度优先） */
function GroupSection({
  title,
  meta,
  children,
}: {
  title: ReactNode
  meta?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="bg-card mb-4 rounded-xl border">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-sm font-medium">{title}</span>
        {meta ? <span className="text-muted-foreground text-xs tabular-nums">{meta}</span> : null}
      </header>
      <div className="divide-y">{children}</div>
    </section>
  )
}

function TimeSlotGroup({ group, lowStockIds }: { group: TodayGroup; lowStockIds: Set<string> }) {
  // 密集折叠（W-01）：同时段「休息 + 停用」≥ 3 项时折叠为一行。
  // 待吃 / 已吃**永不折叠** —— 折叠待办会让用户找不到要打勾的那一项。
  const [expanded, setExpanded] = useState(false)
  const visibleItems = group.items.filter(
    (item) => item.state === 'pending' || item.state === 'taken',
  )
  const offItems = group.items.filter((item) => item.state === 'rest' || item.state === 'paused')
  const pausedCount = offItems.filter((item) => item.state === 'paused').length
  const collapsed = offItems.length >= DENSE_COLLAPSE_THRESHOLD
  const showOff = !collapsed || expanded

  return (
    <GroupSection
      title={TIME_SLOT_LABEL[group.timeSlot]}
      meta={
        <>
          {group.pendingCount} 待吃 · {group.takenCount} 已吃
          {group.offCount > 0 ? ` · ${group.offCount} 今天不用吃` : ''}
        </>
      }
    >
      {visibleItems.map((item) => (
        <DayListItem
          key={`${item.supplementId}-${item.timeSlot}`}
          item={item}
          lowStock={lowStockIds.has(item.supplementId)}
        />
      ))}

      {showOff
        ? offItems.map((item) => (
            <DayListItem
              key={`${item.supplementId}-${item.timeSlot}`}
              item={item}
              lowStock={lowStockIds.has(item.supplementId)}
            />
          ))
        : null}

      {collapsed && !expanded ? (
        <button
          type="button"
          className="text-muted-foreground hover:bg-accent/40 w-full px-4 py-2.5 text-left text-xs"
          onClick={() => setExpanded(true)}
        >
          ▾ 另有 {offItems.length} 项今天不用吃
          {pausedCount > 0 ? `（含 ${pausedCount} 项停用中）` : ''}
        </button>
      ) : null}
    </GroupSection>
  )
}

function WarningCard({ warnings }: { warnings: TodayWarnings }) {
  const rows = [
    { label: '库存为负', items: warnings.negative },
    { label: '临期', items: warnings.expiring },
    { label: '余量偏低', items: warnings.lowStock },
  ].filter((row) => row.items.length > 0)

  if (rows.length === 0) return null

  return (
    <section className="bg-card mb-4 space-y-1 rounded-xl border px-4 py-3">
      {rows.map((row) => (
        // 用暖色点缀，**不用红色** —— 这不是错误，是提醒
        <p key={row.label} className="text-xs text-amber-600">
          {row.label}：
          {row.items.map((item, index) => (
            <span key={item.id}>
              {index > 0 ? '、' : ''}
              <Link
                className="underline underline-offset-2"
                to={`/supplements?highlight=${item.id}`}
              >
                {item.name}
              </Link>
            </span>
          ))}
        </p>
      ))}
    </section>
  )
}

function ExtraRecords({ items }: { items: DayItem[] }) {
  async function handleUndo(item: DayItem) {
    const id = item.recordIds.at(-1)
    if (!id) return
    try {
      await undoIntake(id)
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    }
  }

  return (
    <GroupSection title="计划外记录" meta={`今天额外记了 ${items.length} 条`}>
      {items.map((item) => (
        <div
          key={`${item.supplementId}-${item.timeSlot}-${item.recordIds.join(',')}`}
          className="flex items-center justify-between gap-3 px-4 py-2.5"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {item.supplement?.name ?? '[已删除的补剂]'}
            </p>
            <p className="text-muted-foreground text-xs">
              <span className="tabular-nums">{item.takenAmount}</span>{' '}
              {item.supplement ? UNIT_TYPE_LABEL[item.supplement.unitType] : '份'}
              {' · '}
              {INTAKE_ORIGIN_LABEL[item.origin ?? INTAKE_ORIGIN.MANUAL]}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => handleUndo(item)}>
            撤销
          </Button>
        </div>
      ))}
    </GroupSection>
  )
}

export function TodayPage() {
  const {
    date,
    groups,
    extraItems,
    summary,
    warnings,
    supplementCount,
    activePlanCount,
    loading,
    error,
  } = useTodayData()
  const [manualOpen, setManualOpen] = useState(false)

  const lowStockIds = new Set(warnings.lowStock.map((s) => s.id))
  const nothingToShow = groups.length === 0 && extraItems.length === 0

  return (
    <div className="mx-auto w-full max-w-[720px] p-6">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">今天 · {formatDateLabel(date)}</h1>
          {/* P4：第三个数字独立呈现，不计入任何分母 */}
          <p className="text-muted-foreground mt-1 text-sm tabular-nums">
            待吃 {summary.pending} · 已吃 {summary.taken} · 今天不用吃 {summary.off}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setManualOpen(true)}>
          手动录入
        </Button>
      </header>

      {error ? (
        <ErrorState
          className="mb-4"
          error={error}
          onRetry={() => window.location.reload()}
          onExport={() => void exportToFile()}
        />
      ) : null}

      {!error && loading ? <LoadingSkeleton lines={3} /> : null}

      {!error && !loading && supplementCount === 0 ? (
        <EmptyState
          title="还没有要吃的补剂"
          description="先添加一个补剂，再设置它的服用节奏"
          action={
            <Button asChild>
              <Link to="/supplements?new=1">添加补剂</Link>
            </Button>
          }
        />
      ) : null}

      {/* 「全部关闭」的判据是「有补剂但无启用计划」（§8.1），不是「今天没内容」——
          节奏起点在未来时今天确实没内容，但补剂并没有被停用，不该说「都已停用」 */}
      {!error && !loading && supplementCount > 0 && activePlanCount === 0 ? (
        <EmptyState
          title="所有补剂都已停用"
          description="启用的计划才会出现在这里"
          action={
            <Button variant="outline" asChild>
              <Link to="/supplements">去补剂页看看</Link>
            </Button>
          }
        />
      ) : null}

      {!error && !loading && !nothingToShow ? <WarningCard warnings={warnings} /> : null}

      {!error && !loading
        ? groups.map((group) => (
            <TimeSlotGroup key={group.timeSlot} group={group} lowStockIds={lowStockIds} />
          ))
        : null}

      {!error && !loading && extraItems.length > 0 ? <ExtraRecords items={extraItems} /> : null}

      <ManualIntakeDialog open={manualOpen} onOpenChange={setManualOpen} />
    </div>
  )
}

export default TodayPage
