import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import BackfillDialog from '@/components/backfill/BackfillDialog'
import MissedPlansBanner from '@/components/backfill/MissedPlansBanner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DEFAULT_LOW_STOCK_DAYS,
  INTAKE_STATUS_LABEL,
  PLANNED_AMOUNT_SOURCE,
  TIME_SLOT_LABEL,
  TIME_SLOT_VALUES,
} from '@/constants/enums'
import { getActivePlansForDate } from '@/services/backfillService'
import { UNIT_TYPE_LABEL } from '@/constants/units'
import { useTodayData, type TodayPlanItem } from '@/hooks/useTodayData'
import { supplementRepository } from '@/repositories'
import { metaService } from '@/services/metaService'
import { createIntake, softDeleteIntake } from '@/services/intakeService'
import { summarizeDate } from '@/services/summaryService'
import { useDataVersion } from '@/stores/dataVersion'
import { toast } from '@/stores/toastStore'
import type { DailyIntake, TimeSlot } from '@/types'
import { backfillRange, isBackfill, isExpiringSoon } from '@/utils/date'
import IntakeEditDialog from '@/components/intake/IntakeEditDialog'
import { buildIntake } from '@/utils/intakeFactory'
import { useMissedPlans } from '@/hooks/useMissedPlans'

export function TodayPage() {
  const { date, groups, supplements, records, loading } = useTodayData()
  const version = useDataVersion((s) => s.version)
  const { invalidate } = useMissedPlans()

  const [backfillOpen, setBackfillOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingRecord, setEditingRecord] = useState<DailyIntake | null>(null)

  const supplementOf = (id: string) => supplements.find((s) => s.id === id)
  const nameOf = (id: string) => supplementOf(id)?.name ?? '[已删除的补剂]'
  const unitOf = (id: string) => {
    const found = supplementOf(id)
    return found ? UNIT_TYPE_LABEL[found.unitType] : ''
  }

  const windowDays = useLiveQuery(() => metaService.getBackfillWindowDays(), [], 30) ?? 30
  const range = useMemo(() => backfillRange(windowDays), [windowDays])
  const summary = useLiveQuery(() => summarizeDate(date), [date, version], [])
  const activePlans = useLiveQuery(() => getActivePlansForDate(date), [date, version], [])

  const warnings = useMemo(() => {
    const negative = supplements.filter(
      (s) => s.stockCountInUsageUnit != null && s.stockCountInUsageUnit < 0,
    )
    const expiring = supplements.filter((s) => isExpiringSoon(s.expiryDate))
    // 库存不足：按当日计划推算剩余可用天数 < 阈值
    const lowStock = supplements.filter((s) => {
      if (s.stockCountInUsageUnit == null) return false
      const dailyUsage = activePlans
        .filter((p) => p.supplementId === s.id)
        .reduce((sum, p) => sum + p.dailyAmount, 0)
      if (dailyUsage <= 0) return false
      return (
        s.stockCountInUsageUnit >= 0 &&
        s.stockCountInUsageUnit / dailyUsage < DEFAULT_LOW_STOCK_DAYS
      )
    })
    return { negative, expiring, lowStock }
  }, [supplements, activePlans])

  async function handleCheckIn(item: TodayPlanItem) {
    if (!item.supplement) return
    if (isExpiringSoon(item.supplement.expiryDate)) {
      if (!window.confirm(`${item.supplement.name} 已临近过期，仍要打卡吗？`)) return
    }
    setBusyId(`${item.plan.id}|${item.timeSlot}`)
    try {
      await createIntake(
        buildIntake({
          date,
          supplementId: item.plan.supplementId,
          timeSlot: item.timeSlot,
          actualAmount: item.plan.dailyAmount,
          status: 'taken',
          source: 'plan',
          planId: item.plan.id,
          plannedAmountSnapshot: item.plan.dailyAmount,
          plannedAmountSource: PLANNED_AMOUNT_SOURCE.PLAN_SNAPSHOT,
        }),
        'today',
      )
      toast(`已打卡：${item.supplement.name}`)
      invalidate()
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  async function handleUndoRecord(record: DailyIntake) {
    try {
      await softDeleteIntake(record.id)
      toast('已撤销，可在「设置 → 回收站」恢复')
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    }
  }

  async function handleUndo(item: TodayPlanItem) {
    if (!item.record) return
    setBusyId(`${item.plan.id}|${item.timeSlot}`)
    try {
      await handleUndoRecord(item.record)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">今日 · {date}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            按时段完成打卡，漏服请在次日通过补录标记。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBackfillOpen(true)}>
            补录昨日
          </Button>
          <Button onClick={() => setManualOpen(true)}>手动录入</Button>
        </div>
      </header>

      <MissedPlansBanner onBackfill={() => setBackfillOpen(true)} />

      {(warnings.negative.length > 0 ||
        warnings.expiring.length > 0 ||
        warnings.lowStock.length > 0) && (
        <div className="mb-4 rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {warnings.negative.length > 0 && (
            <div>
              库存为负：{warnings.negative.map((s) => s.name).join('、')}，请补货或调整库存。
            </div>
          )}
          {warnings.expiring.length > 0 && (
            <div>临期补剂：{warnings.expiring.map((s) => s.name).join('、')}</div>
          )}
          {warnings.lowStock.length > 0 && (
            <div>库存不足：{warnings.lowStock.map((s) => s.name).join('、')}（不足 7 天用量）</div>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中…</p>
      ) : groups.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          今天没有启用的计划，先去补剂库添加补剂并创建服用计划。
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <Card key={group.timeSlot}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{TIME_SLOT_LABEL[group.timeSlot]}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {group.items.map((item) => {
                  const key = `${item.plan.id}|${item.timeSlot}`
                  const unit = item.supplement
                    ? ` ${UNIT_TYPE_LABEL[item.supplement.unitType]}`
                    : ''
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {item.supplement?.name ?? '[已删除的补剂]'}
                          {item.paused && <Badge variant="secondary">停药中</Badge>}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          计划 {item.plan.dailyAmount}
                          {unit}
                          {item.record && ` · 实际 ${item.record.actualAmount}${unit}`}
                          {item.record && ` · ${INTAKE_STATUS_LABEL[item.record.status]}`}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {item.record ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === key}
                            onClick={() => handleUndo(item)}
                          >
                            撤销
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={busyId === key}
                            onClick={() => handleCheckIn(item)}
                          >
                            打卡
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">今日记录（{records.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-muted-foreground text-sm">今天还没有任何记录。</p>
          ) : (
            <ul className="flex flex-col">
              {records.map((record) => (
                <li
                  key={record.id}
                  className="flex items-center justify-between border-b py-2 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {nameOf(record.supplementId)}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {TIME_SLOT_LABEL[record.timeSlot]} · {record.actualAmount}{' '}
                      {unitOf(record.supplementId)} · {INTAKE_STATUS_LABEL[record.status]}
                      {record.source === 'manual' ? ' · 手动录入' : ' · 计划打卡'}
                      {isBackfill(record.date, record.createdAt) ? ' · 补录' : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditingRecord(record)}>
                      修改
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleUndoRecord(record)}>
                      撤销
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground mt-3 text-xs">
            撤销 = 删除该记录并回滚库存，之后可在「设置 → 回收站」恢复或彻底删除。
          </p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">今日成分摄入</CardTitle>
        </CardHeader>
        <CardContent>
          {(summary ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {records.length > 0
                ? '今日记录的补剂尚未关联成分，请到「补剂库 → 成分」配置每份含量。'
                : '暂无数据'}
            </p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {(summary ?? []).map((item) => (
                <li key={`${item.ingredientId}-${item.unit}`} className="flex justify-between">
                  <span>
                    {item.name}
                    {item.hasDeletedSupplement && (
                      <span className="text-muted-foreground ml-1 text-xs">含已删除补剂</span>
                    )}
                  </span>
                  <span
                    className={
                      item.upperLimit != null && item.total > item.upperLimit
                        ? 'text-destructive font-medium'
                        : ''
                    }
                  >
                    {item.displayValue} {item.displayUnit}
                    {item.upperLimit != null && ` / 上限 ${item.upperLimit}${item.unit}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground mt-3 text-xs">
            数据基于标签含量累加，不代表医学精确摄入量。
          </p>
        </CardContent>
      </Card>

      <BackfillDialog
        open={backfillOpen}
        onOpenChange={setBackfillOpen}
        defaultDate={range.max}
        range={range}
        onFinished={invalidate}
      />
      <ManualIntakeDialog open={manualOpen} onOpenChange={setManualOpen} date={date} />
      <IntakeEditDialog
        record={editingRecord}
        supplementName={editingRecord ? nameOf(editingRecord.supplementId) : ''}
        unit={editingRecord ? unitOf(editingRecord.supplementId) : ''}
        onClose={() => setEditingRecord(null)}
      />
    </div>
  )
}

function ManualIntakeDialog({
  open,
  onOpenChange,
  date,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  date: string
}) {
  const supplements = useLiveQuery(() => supplementRepository.all(), [], [])
  const [supplementId, setSupplementId] = useState('')
  const [timeSlot, setTimeSlot] = useState<TimeSlot>('morning')
  const [amount, setAmount] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!supplementId) {
      toast('请选择补剂')
      return
    }
    setSubmitting(true)
    try {
      await createIntake(
        buildIntake({
          date,
          supplementId,
          timeSlot,
          actualAmount: amount,
          status: 'taken',
          source: 'manual',
          plannedAmountSource: PLANNED_AMOUNT_SOURCE.UNAVAILABLE,
        }),
        'today',
      )
      toast('已记录')
      onOpenChange(false)
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>手动录入（{date}）</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>补剂</Label>
            <Select value={supplementId} onValueChange={setSupplementId}>
              <SelectTrigger>
                <SelectValue placeholder="选择补剂" />
              </SelectTrigger>
              <SelectContent>
                {supplements.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>时段</Label>
            <Select value={timeSlot} onValueChange={(v) => setTimeSlot(v as TimeSlot)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_SLOT_VALUES.map((slot) => (
                  <SelectItem key={slot} value={slot}>
                    {TIME_SLOT_LABEL[slot]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>数量</Label>
            <Input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={submitting}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default TodayPage
