import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { PausePeriodDialog } from '@/components/pause/PausePeriodDialog'
import { usePauseData, type PausePeriodRow } from '@/hooks/usePauseData'
import { deletePausePeriod } from '@/services/pauseService'
import { toast } from '@/stores/toastStore'
import { formatShortDate } from '@/utils/date'
import type { PausePeriod } from '@/types'

/**
 * 停药页（§8.3）。
 *
 * 两个分区并列，不藏进 Tab —— 它们对应两种真实用法：
 *   方案组 = 成套情景，一键切换（M2）
 *   临时停药 = 随手加一条，轻量高频（M1）
 * M1 就把「方案组」分区的骨架渲染出来，避免 M2 再改一次信息架构。
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

export function PausePeriodsPage() {
  const { schemes, periods, supplements, loading } = usePauseData()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PausePeriod | null>(null)
  const [deleting, setDeleting] = useState<PausePeriodRow | null>(null)

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(period: PausePeriod) {
    setEditing(period)
    setDialogOpen(true)
  }

  return (
    <div className="mx-auto w-full max-w-[720px] p-6">
      <h1 className="mb-4 text-xl font-semibold">停药</h1>

      {loading ? <LoadingSkeleton lines={3} /> : null}

      {!loading ? (
        <>
          <Section title="停药方案组">
            {schemes.length === 0 ? (
              <EmptyState
                className="border-0"
                title="还没有停药方案组"
                description="一套情景可以同时停多种补剂，需要时一键切换"
              />
            ) : (
              schemes.map(({ scheme, entryCount }) => (
                <div
                  key={scheme.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className={scheme.isActive ? 'text-violet-500' : 'text-slate-400'}>
                        {scheme.isActive ? '●' : '○'}
                      </span>
                      {scheme.name}
                      {scheme.isActive ? <Badge variant="secondary">执行中</Badge> : null}
                    </p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      覆盖 {entryCount} 项
                      {scheme.activatedAt ? ` · ${formatShortDate(scheme.activatedAt)} 起` : ''}
                      {scheme.endedAt ? ' · 已停止' : ''}
                    </p>
                  </div>
                </div>
              ))
            )}
          </Section>

          <Section
            title="临时停药"
            action={
              <Button size="sm" onClick={openCreate}>
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
                    <Button size="sm" variant="outline" onClick={() => openEdit(row.period)}>
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
    </div>
  )
}

export default PausePeriodsPage
