import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { StateSwatch } from '@/components/common/ItemStateView'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { Button } from '@/components/ui/button'
import { BackupRemindBanner } from '@/components/today/BackupRemindBanner'
import { DayListItem } from '@/components/today/DayListItem'
import { IngredientSummaryCard } from '@/components/today/IngredientSummaryCard'
import { ManualIntakeDialog } from '@/components/today/ManualIntakeDialog'
import { PauseSchemeBanner } from '@/components/today/PauseSchemeBanner'
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
import { formatDateLabel, formatShortDate } from '@/utils/date'
import type { DayItem, ItemState } from '@/utils/dayState'

/**
 * 今日页（§8.1）★ 全产品价值集中在这一屏。
 *
 * 目标：打开 5 秒内知道今天吃什么 → 点一下完成记录 → 不跳转、不滚动、不弹窗。
 *
 * 布局按 Ardot 设计稿首页（3:1023）：**满宽**（不再限宽 720 居中，见 DECISIONS 的 DIFF 记录）
 * ①标题行 ②停药提醒条/③预警区（并排一行）→ 四时段**看板**（早上/中午/晚上/睡前）
 * → ⑧今日摄入成分一览 → ⑦计划外记录 → 页脚说明
 *
 * 明确不做（别顺手加上）：
 *   ❌ 日期切换（回看是日历页的职责）  ❌ 完成度百分比 / 进度环
 *   ❌ 庆祝动效 / 连续打卡天数 / 健康评分  ❌ 「今天先不吃」快捷入口
 */

/** ③ 预警区：浅黄底 + 三项横排，每项一个橙点。三类分列，不合并成一句话（T-306） */
function WarningBar({ warnings }: { warnings: TodayWarnings }) {
  const rows = [
    { label: '库存为负', items: warnings.negative, withDate: false },
    { label: '临期', items: warnings.expiring, withDate: true },
    { label: '余量偏低', items: warnings.lowStock, withDate: false },
  ].filter((row) => row.items.length > 0)

  if (rows.length === 0) return null

  return (
    <section className="flex min-h-[38px] flex-1 flex-wrap items-center gap-x-5 gap-y-1 rounded-xl bg-amber-50 px-4 py-[11px]">
      {rows.map((row) => (
        <span key={row.label} className="flex min-w-0 items-center gap-1.5 text-xs text-amber-700">
          <span className="size-1.5 shrink-0 rounded-full bg-amber-600" aria-hidden />
          <span className="truncate">
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
                {row.withDate && item.expiryDate ? ` · ${formatShortDate(item.expiryDate)}` : ''}
              </span>
            ))}
          </span>
        </span>
      ))}
    </section>
  )
}

/**
 * 列头的状态点：整列「现在有没有要做的事」（设计稿的「待吃」实心点 / 「全休息」描边圈）。
 *
 * 只有三档：待吃（琥珀）/ 全吃完（绿）/ 不用吃（灰圈）。
 * **不区分**「休息」与「停用」—— 那是每一张卡片自己的事，
 * 列头只需要回答「这一列今天还需不需要我动手」。设计稿的「中午」列同时有
 * 休息与停用两张卡，列头用的仍是灰圈，就是这个意思。
 */
function columnDotState(group: TodayGroup): ItemState {
  if (group.pendingCount > 0) return 'pending'
  if (group.takenCount > 0) return 'taken'
  return 'rest'
}

function columnStats(group: TodayGroup): string {
  const parts: string[] = []
  if (group.pendingCount > 0) parts.push(`${group.pendingCount} 待吃`)
  if (group.takenCount > 0) parts.push(`${group.takenCount} 已吃`)
  if (group.offCount > 0) parts.push(`${group.offCount} 今天不用吃`)
  return parts.join(' · ')
}

/** 看板的一列（一个时段） */
function TimeSlotColumn({ group, lowStockIds }: { group: TodayGroup; lowStockIds: Set<string> }) {
  // 密集折叠（W-01）：同列「休息 + 停用」≥ 3 项时折叠。
  // 待吃 / 已吃**永不折叠** —— 折叠待办会让用户找不到要打勾的那一项。
  const [expanded, setExpanded] = useState(false)
  const onItems = group.items.filter((item) => item.state === 'pending' || item.state === 'taken')
  const offItems = group.items.filter((item) => item.state === 'rest' || item.state === 'paused')
  const pausedCount = offItems.filter((item) => item.state === 'paused').length
  const collapsed = offItems.length >= DENSE_COLLAPSE_THRESHOLD
  const showOff = !collapsed || expanded

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-2.5 rounded-xl border p-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="grid size-4 shrink-0 place-items-center">
            <StateSwatch state={columnDotState(group)} />
          </span>
          <span className="text-sm font-medium">{TIME_SLOT_LABEL[group.timeSlot]}</span>
        </div>
        <p className="text-muted-foreground text-[11px] leading-4 tabular-nums">
          {columnStats(group)}
        </p>
      </div>

      <div className="bg-border h-px" />

      <div className="flex flex-col gap-1.5">
        {onItems.map((item) => (
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
            className="text-muted-foreground hover:bg-accent/40 w-full rounded-md px-2 py-2 text-left text-[11px]"
            onClick={() => setExpanded(true)}
          >
            ▾ 另有 {offItems.length} 项今天不用吃
            {pausedCount > 0 ? `（含 ${pausedCount} 项停用中）` : ''}
          </button>
        ) : null}
      </div>
    </section>
  )
}

/** ⑦ 计划外记录：浅灰底块，一行一条 */
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
    <section className="flex flex-col gap-2 rounded-xl bg-[#FAFAFA] px-4 py-3">
      <p className="text-muted-foreground text-xs">计划外记录</p>
      {items.map((item) => (
        <div
          key={`${item.supplementId}-${item.timeSlot}-${item.recordIds.join(',')}`}
          className="flex items-center justify-between gap-3"
        >
          <span className="text-[13px] font-medium text-slate-700">
            {item.supplement?.name ?? '[已删除的补剂]'} {item.takenAmount}{' '}
            {item.supplement ? UNIT_TYPE_LABEL[item.supplement.unitType] : '份'} ·{' '}
            {INTAKE_ORIGIN_LABEL[item.origin ?? INTAKE_ORIGIN.MANUAL]}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground h-7 shrink-0 rounded-[6px] px-2 text-xs"
            onClick={() => handleUndo(item)}
          >
            撤销
          </Button>
        </div>
      ))}
    </section>
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
    activeScheme,
    activeSchemeEntryCount,
    loading,
    error,
  } = useTodayData()
  const [manualOpen, setManualOpen] = useState(false)

  const lowStockIds = new Set(warnings.lowStock.map((s) => s.id))
  const hasWarnings =
    warnings.negative.length + warnings.expiring.length + warnings.lowStock.length > 0

  return (
    <div className="w-full px-8 py-8">
      {/* ① 标题行 */}
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-[3px]">
          <h1 className="text-[22px] leading-[30px] font-semibold">
            今天 · {formatDateLabel(date)}
          </h1>
          {/* P4：第三个数字独立呈现，不计入任何分母 */}
          <p className="text-muted-foreground text-[13px] leading-[18px] tabular-nums">
            待吃 {summary.pending} · 已吃 {summary.taken} · 今天不用吃 {summary.off}
          </p>
        </div>
        <Button
          variant="outline"
          className="h-9 shrink-0 rounded-[6px] px-3.5"
          onClick={() => setManualOpen(true)}
        >
          手动录入
        </Button>
      </header>

      <div className="mt-4 flex flex-col gap-4">
        {error ? (
          <ErrorState
            error={error}
            onRetry={() => window.location.reload()}
            onExport={() => void exportToFile()}
          />
        ) : null}

        {!error && loading ? <LoadingSkeleton lines={3} /> : null}

        {!error && !loading ? (
          <>
            {/* ② 停药提醒条 + ③ 预警区：设计稿里并排一条 */}
            {activeScheme || hasWarnings ? (
              <div className="flex items-stretch gap-4">
                {activeScheme ? (
                  <PauseSchemeBanner scheme={activeScheme} entryCount={activeSchemeEntryCount} />
                ) : null}
                <WarningBar warnings={warnings} />
              </div>
            ) : null}

            {/* 备份提醒（T-307，设计稿未画）：数据只在本机，多久没备份必须能被看见 */}
            <BackupRemindBanner />

            {supplementCount === 0 ? (
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
            {supplementCount > 0 && activePlanCount === 0 ? (
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

            {supplementCount > 0 ? (
              <>
                {/* 看板：4 个时段并排 */}
                {groups.length > 0 ? (
                  <div className="flex gap-6">
                    {groups.map((group) => (
                      <TimeSlotColumn
                        key={group.timeSlot}
                        group={group}
                        lowStockIds={lowStockIds}
                      />
                    ))}
                  </div>
                ) : null}

                {/* ⑧ 成分一览：回顾性内容，放在看板之后（R-02：只有数字并列） */}
                <IngredientSummaryCard date={date} />

                {/* ⑦ 计划外记录 */}
                {extraItems.length > 0 ? <ExtraRecords items={extraItems} /> : null}

                {/* 页脚说明：解释两条最容易误解的行为 */}
                <p className="text-muted-foreground text-xs">
                  漏服可在次日通过「补录昨日」标记；撤销会删除该条记录并回滚当日库存。
                </p>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      <ManualIntakeDialog open={manualOpen} onOpenChange={setManualOpen} />
    </div>
  )
}

export default TodayPage
