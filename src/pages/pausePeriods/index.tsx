import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { PausePeriodDialog } from '@/components/pause/PausePeriodDialog'
import { PauseSchemeDialog } from '@/components/pause/PauseSchemeDialog'
import { usePauseData, type PausePeriodRow, type PauseSchemeRow } from '@/hooks/usePauseData'
import {
  activateScheme,
  deletePausePeriod,
  deleteScheme,
  stopScheme,
} from '@/services/pauseService'
import { toast } from '@/stores/toastStore'
import { formatShortDate, today } from '@/utils/date'
import {
  cyclicProgress,
  describeSchemeCycle,
  nextCyclicOffDay,
  nextCyclicOnDay,
} from '@/utils/pause'
import type { PausePeriod } from '@/types'

/**
 * 停药页（§8.3）。
 *
 * 两个分区并列，不藏进 Tab —— 它们对应两种真实用法：
 *   方案组 = 成套情景，一键切换（M2）
 *   临时停药 = 随手加一条，轻量高频（M1）
 *
 * 「同一时刻至多一组执行中」由 pauseService.activateScheme 在事务里保证；
 * 界面这一层负责的是 W-04 的**轻确认**：执行新组之前告诉用户会结束哪一组。
 * 不弹这个确认，用户会以为两组同时在生效。
 */

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="bg-card mb-4 rounded-xl border">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-sm font-medium">{title}</span>
        {action}
      </header>
      <div className="divide-y">{children}</div>
    </section>
  )
}

/** 「9/19 → 9/21 · 原因：胃不舒服」或「9/25 起 · 持续中（未设结束日）」 */
function describeRange(period: PausePeriod): string {
  if (period.startDate == null) return '跟随方案组'
  const start = formatShortDate(period.startDate)
  if (period.endDate == null) return `${start} 起 · 持续中（未设结束日）`
  return `${start} → ${formatShortDate(period.endDate)}`
}

/**
 * 方案组行内的说明。
 *
 * 连续方案：「覆盖 3 项 · 连续 · 9/18 起 · 未设结束日」
 * 周期方案：「覆盖 3 项 · 吃 21 停 7 · 第 22/28 天 · 停用中 · 9/29 恢复」
 *
 * 周期方案刻意**不**显示「执行日」和「未设结束日」——用户真正关心的是「现在第几天、
 * 下一次停/吃是什么时候」，而周期是无限的，说「未设结束日」只是噪音。
 */
function describeScheme(row: PauseSchemeRow, now: string): string {
  const { scheme } = row
  const parts = [`覆盖 ${row.entryCount} 项`, describeSchemeCycle(scheme) ?? '连续']

  if (!scheme.isActive) {
    parts.push(scheme.endedAt ? '已停止' : '未执行')
    return parts.join(' · ')
  }

  const progress = cyclicProgress(scheme, now)
  if (!progress) {
    if (scheme.activatedAt) parts.push(`${formatShortDate(scheme.activatedAt)} 起`)
    parts.push(scheme.endedAt ? '已停止' : '未设结束日')
    return parts.join(' · ')
  }

  parts.push(`第 ${progress.day}/${progress.total} 天`)
  if (progress.offDay) {
    const resume = nextCyclicOnDay(scheme, now)
    parts.push(resume ? `停用中 · ${formatShortDate(resume)} 恢复` : '停用中')
  } else {
    const nextOff = nextCyclicOffDay(scheme, now)
    parts.push(nextOff ? `${formatShortDate(nextOff)} 起停` : '服用中')
  }
  return parts.join(' · ')
}

export function PausePeriodsPage() {
  const { schemes, periods, supplements, loading } = usePauseData()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PausePeriod | null>(null)
  const [deleting, setDeleting] = useState<PausePeriodRow | null>(null)

  const [schemeDialogOpen, setSchemeDialogOpen] = useState(false)
  const [editingScheme, setEditingScheme] = useState<PauseSchemeRow | null>(null)
  /** 待执行但还没确认的方案组（W-04 轻确认） */
  const [activating, setActivating] = useState<PauseSchemeRow | null>(null)
  const [deletingScheme, setDeletingScheme] = useState<PauseSchemeRow | null>(null)

  const activeScheme = schemes.find((row) => row.scheme.isActive) ?? null

  function openCreatePeriod() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEditPeriod(period: PausePeriod) {
    setEditing(period)
    setDialogOpen(true)
  }

  function openCreateScheme() {
    setEditingScheme(null)
    setSchemeDialogOpen(true)
  }

  function openEditScheme(row: PauseSchemeRow) {
    setEditingScheme(row)
    setSchemeDialogOpen(true)
  }

  /** 没有执行中的组就直接执行；有则先问一句（W-04） */
  function requestActivate(row: PauseSchemeRow) {
    if (activeScheme && activeScheme.scheme.id !== row.scheme.id) {
      setActivating(row)
      return
    }
    void runActivate(row)
  }

  async function runActivate(row: PauseSchemeRow) {
    const cycleLabel = describeSchemeCycle(row.scheme)
    try {
      const { endedScheme } = await activateScheme(row.scheme.id, today())
      // 周期方案在执行时必须说清「今天就是第 1 天」——用户会去找一个「周期起点」输入框
      toast(
        endedScheme
          ? `已执行「${row.scheme.name}」，并结束了「${endedScheme.name}」`
          : cycleLabel
            ? `已执行「${row.scheme.name}」，今天算第 1 天（${cycleLabel}）`
            : `已执行「${row.scheme.name}」`,
      )
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    }
  }

  async function runStop(row: PauseSchemeRow) {
    try {
      await stopScheme(row.scheme.id, today())
      toast(`已停止「${row.scheme.name}」`)
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    }
  }

  return (
    <div className="mx-auto w-full max-w-[720px] p-6">
      <h1 className="mb-4 text-xl font-semibold">停药</h1>

      {loading ? <LoadingSkeleton lines={3} /> : null}

      {!loading ? (
        <>
          <Section
            title="停药方案组"
            action={
              <Button size="sm" onClick={openCreateScheme}>
                新建方案组
              </Button>
            }
          >
            {schemes.length === 0 ? (
              <EmptyState
                className="border-0"
                title="还没有停药方案组"
                description="一套情景可以同时停多种补剂，需要时一键切换"
              />
            ) : (
              schemes.map((row) => (
                <div
                  key={row.scheme.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className={row.scheme.isActive ? 'text-violet-500' : 'text-slate-400'}>
                        {row.scheme.isActive ? '●' : '○'}
                      </span>
                      <span className="truncate">{row.scheme.name}</span>
                      {row.scheme.isActive ? <Badge variant="secondary">执行中</Badge> : null}
                    </p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {describeScheme(row, today())}
                      {row.scheme.note ? ` · ${row.scheme.note}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {row.scheme.isActive ? (
                      <Button size="sm" variant="outline" onClick={() => void runStop(row)}>
                        停止
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => requestActivate(row)}>
                        执行
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openEditScheme(row)}>
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setDeletingScheme(row)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              ))
            )}
          </Section>

          <Section
            title="临时停药"
            action={
              <Button size="sm" onClick={openCreatePeriod}>
                加一条停药
              </Button>
            }
          >
            {periods.length === 0 ? (
              <p className="text-muted-foreground px-4 py-6 text-center text-sm">
                还没有临时停药条目
              </p>
            ) : (
              periods.map((row) => (
                <div
                  key={row.period.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.targetName}</p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {describeRange(row.period)}
                      {row.period.reason ? ` · 原因：${row.period.reason}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditPeriod(row.period)}>
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setDeleting(row)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              ))
            )}
          </Section>
        </>
      ) : null}

      <PausePeriodDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        supplements={supplements}
        period={editing}
      />

      <PauseSchemeDialog
        open={schemeDialogOpen}
        onOpenChange={setSchemeDialogOpen}
        supplements={supplements}
        scheme={editingScheme?.scheme ?? null}
        entries={editingScheme?.entries}
      />

      {/* W-07：删条目是轻确认，不套用「删补剂」的强度 */}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        strength="light"
        title="删除这条停药"
        confirmLabel="删除"
        description={
          deleting
            ? `${deleting.targetName} · ${describeRange(deleting.period)}。删除后这段停用判定不再生效，已有的记录不受影响。`
            : ''
        }
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deletePausePeriod(deleting.period.id)
          } catch (error) {
            toast((error as Error).message, { variant: 'destructive' })
            throw error
          }
        }}
      />

      {/* W-04：执行新组会结束旧组，必须说清楚是哪一组 */}
      <ConfirmDialog
        open={activating !== null}
        onOpenChange={(open) => {
          if (!open) setActivating(null)
        }}
        strength="light"
        title="执行这个方案组"
        confirmLabel="执行"
        description={
          activating && activeScheme
            ? `执行「${activating.scheme.name}」将结束当前执行中的「${activeScheme.scheme.name}」，确认？`
            : ''
        }
        onConfirm={async () => {
          if (!activating) return
          await runActivate(activating)
        }}
      />

      <ConfirmDialog
        open={deletingScheme !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingScheme(null)
        }}
        strength="light"
        title="删除这个方案组"
        confirmLabel="删除"
        description={
          deletingScheme
            ? `「${deletingScheme.scheme.name}」及其 ${deletingScheme.entryCount} 项条目会一起删除。已有的记录不受影响。`
            : ''
        }
        onConfirm={async () => {
          if (!deletingScheme) return
          try {
            await deleteScheme(deletingScheme.scheme.id)
          } catch (error) {
            toast((error as Error).message, { variant: 'destructive' })
            throw error
          }
        }}
      />
    </div>
  )
}

export default PausePeriodsPage
