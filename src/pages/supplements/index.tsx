import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { DeleteSupplementDialog } from '@/components/supplement/DeleteSupplementDialog'
import { SupplementDialog } from '@/components/supplement/SupplementDialog'
import { UNIT_TYPE_LABEL } from '@/constants/units'
import { useSupplementList, type SupplementRow } from '@/hooks/useSupplementList'
import type { Supplement } from '@/types'
import { cn } from 'cn'

/**
 * 补剂页（§8.2）。这一页合并了原「服用计划」页
 * —— 节奏是计划的属性，但用户心智里它就是「这个补剂怎么吃」。
 *
 * 「已关闭」与「今天休息」是两件事，文案不得混用：
 *   已关闭（isActive=false）：列表里降饱和，**今日页完全不出现**
 *   节奏休息：只在今日页表现为「今天不用吃」，列表里一切正常
 */

interface DialogState {
  supplement: Supplement | null
  plan: SupplementRow['plan'] | null
  fixRate: boolean
}

function StatusBadge({ row }: { row: SupplementRow }) {
  if (row.configError) {
    // R-08 的落地：该补剂仍然出现在今日页并判为「该吃」，只在管理页标异常
    return <Badge className="border-amber-300 bg-amber-50 text-amber-700">配置异常</Badge>
  }
  if (!row.plan) {
    return <Badge variant="outline">无计划</Badge>
  }
  return row.plan.isActive ? (
    <Badge variant="secondary">启用</Badge>
  ) : (
    <Badge variant="outline">已关闭</Badge>
  )
}

function StockCell({ row }: { row: SupplementRow }) {
  const { supplement, lowStock } = row
  if (supplement.stockCount == null) return <span className="text-muted-foreground">—</span>
  return (
    <span
      className={cn('tabular-nums', supplement.stockCount < 0 && 'text-destructive font-medium')}
    >
      {supplement.stockCount}
      {lowStock ? '（偏低）' : ''}
    </span>
  )
}

export function SupplementsPage() {
  const { rows, loading } = useSupplementList()
  const [searchParams, setSearchParams] = useSearchParams()
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [deleting, setDeleting] = useState<Supplement | null>(null)

  const highlight = searchParams.get('highlight')

  // D-12：今日页空状态跳 /supplements?new=1 直接开窗，少一次点击
  useEffect(() => {
    if (searchParams.get('new') !== '1') return
    setDialog({ supplement: null, plan: null, fixRate: false })
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  return (
    <div className="mx-auto w-full max-w-[720px] p-6">
      <header className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">补剂</h1>
        <Button onClick={() => setDialog({ supplement: null, plan: null, fixRate: false })}>
          新增补剂
        </Button>
      </header>

      {loading ? <LoadingSkeleton lines={4} /> : null}

      {!loading && rows.length === 0 ? (
        <EmptyState
          title="还没有补剂"
          description="先添加一个补剂，再设置它的服用节奏"
          action={
            <Button onClick={() => setDialog({ supplement: null, plan: null, fixRate: false })}>
              添加补剂
            </Button>
          }
        />
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="bg-card rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>每次量</TableHead>
                <TableHead>节奏</TableHead>
                <TableHead>时段</TableHead>
                <TableHead>余量</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.supplement.id}
                  className={cn(
                    row.configError && 'bg-amber-50',
                    highlight === row.supplement.id && 'ring-2 ring-amber-400',
                  )}
                >
                  <TableCell>
                    <div className="font-medium">{row.supplement.name}</div>
                    {row.configError ? (
                      <div className="text-xs font-medium text-amber-600">配置异常，请修正</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.plan?.isActive
                      ? `${row.plan.amountPerTime} ${UNIT_TYPE_LABEL[row.supplement.unitType]}`
                      : '—'}
                  </TableCell>
                  <TableCell>{row.rateLabel}</TableCell>
                  <TableCell>{row.timeSlotLabels.join(' + ') || '—'}</TableCell>
                  <TableCell>
                    <StockCell row={row} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge row={row} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDialog({
                            supplement: row.supplement,
                            plan: row.plan ?? null,
                            fixRate: row.configError,
                          })
                        }
                      >
                        {row.configError ? '修正' : '编辑'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeleting(row.supplement)}
                      >
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <SupplementDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
        supplement={dialog?.supplement ?? null}
        plan={dialog?.plan ?? null}
        fixRate={dialog?.fixRate ?? false}
      />

      <DeleteSupplementDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        supplement={deleting}
      />
    </div>
  )
}

export default SupplementsPage
