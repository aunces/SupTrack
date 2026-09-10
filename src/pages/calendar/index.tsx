import { useLiveQuery } from 'dexie-react-hooks'
import { addMonths, format } from 'date-fns'
import { useState } from 'react'
import BackfillDialog from '@/components/backfill/BackfillDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { INTAKE_STATUS_LABEL, TIME_SLOT_LABEL } from '@/constants/enums'
import { UNIT_TYPE_LABEL } from '@/constants/units'
import { useCalendarData, type DayStat } from '@/hooks/useCalendarData'
import { dailyIntakeRepository, supplementRepository } from '@/repositories'
import { metaService } from '@/services/metaService'
import { toast } from '@/stores/toastStore'
import { backfillRange, isBackfill, today } from '@/utils/date'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function CalendarPage() {
  const [monthKey, setMonthKey] = useState(() => format(new Date(), 'yyyy-MM'))
  const [selected, setSelected] = useState<string | null>(null)
  const [backfillOpen, setBackfillOpen] = useState(false)

  const stats = useCalendarData(monthKey)
  const windowDays = useLiveQuery(() => metaService.getBackfillWindowDays(), [], 30) ?? 30
  const range = backfillRange(windowDays)

  const records = useLiveQuery(
    () => (selected ? dailyIntakeRepository.listByDate(selected) : Promise.resolve([])),
    [selected],
    [],
  )
  const supplements = useLiveQuery(() => supplementRepository.all(), [], [])

  const nameOf = (id: string) => supplements.find((s) => s.id === id)?.name ?? '[已删除的补剂]'
  const unitOf = (id: string) => {
    const found = supplements.find((s) => s.id === id)
    return found ? UNIT_TYPE_LABEL[found.unitType] : ''
  }
  const selectedStat = stats?.find((s) => s.date === selected)
  const canBackfill = Boolean(selected && selected >= range.min && selected <= range.max)

  return (
    <div className="p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">日历</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setMonthKey(format(addMonths(new Date(`${monthKey}-01`), -1), 'yyyy-MM'))
            }
          >
            上一月
          </Button>
          <span className="text-sm">{monthKey}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMonthKey(format(addMonths(new Date(`${monthKey}-01`), 1), 'yyyy-MM'))}
          >
            下一月
          </Button>
        </div>
      </header>

      <div className="flex gap-4">
        <Card className="flex-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">完成度热力图</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {WEEKDAYS.map((day) => (
                <div key={day} className="text-muted-foreground py-1">
                  {day}
                </div>
              ))}
              {stats?.map((stat) => (
                <button
                  key={stat.date}
                  onClick={() => setSelected(stat.date)}
                  className={[
                    'h-14 rounded-md border text-left transition-colors',
                    dayClass(stat),
                    selected === stat.date ? 'ring-2 ring-primary' : '',
                  ].join(' ')}
                >
                  <div className="px-1 pt-1 text-[10px] opacity-70">
                    {Number(stat.date.slice(-2))}
                  </div>
                  <div className="px-1 text-[11px]">
                    {stat.completion === null ? '无计划' : `${Math.round(stat.completion * 100)}%`}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="w-80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {selected ? `${selected} 详情` : '选择日期查看'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <p className="text-muted-foreground text-sm">点击左侧日期查看当日记录。</p>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedStat && (
                  <p className="text-muted-foreground text-xs">
                    应服 {selectedStat.planned} 项 · 已服 {selectedStat.taken} 项 · 漏服{' '}
                    {selectedStat.skipped} 项{selectedStat.paused ? ' · 含停药日' : ''}
                  </p>
                )}
                <Button
                  size="sm"
                  disabled={!canBackfill}
                  onClick={() => setBackfillOpen(true)}
                  title={canBackfill ? undefined : '超出补录范围（仅过去 30 天且不含今天）'}
                >
                  新增记录（补录）
                </Button>
                <ul className="flex flex-col gap-1 text-sm">
                  {(records ?? []).length === 0 ? (
                    <li className="text-muted-foreground py-4 text-center">当日无记录</li>
                  ) : (
                    (records ?? []).map((record) => (
                      <li key={record.id} className="rounded-md border px-2 py-1">
                        <div className="font-medium">{nameOf(record.supplementId)}</div>
                        <div className="text-muted-foreground text-xs">
                          {TIME_SLOT_LABEL[record.timeSlot]} · {record.actualAmount}{' '}
                          {unitOf(record.supplementId)} · {INTAKE_STATUS_LABEL[record.status]}
                          {isBackfill(record.date, record.createdAt) ? ' · 补录' : ''}
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <BackfillDialog
        open={backfillOpen}
        onOpenChange={setBackfillOpen}
        defaultDate={selected ?? range.max}
        range={range}
        onFinished={() => toast('已补录')}
      />
    </div>
  )
}

function dayClass(stat: DayStat): string {
  if (stat.completion === null) return 'bg-muted'
  if (stat.extra > 0) return 'bg-red-100 border-red-300'
  if (stat.skipped > 0 && stat.completion < 1) return 'bg-amber-100 border-amber-300'
  if (stat.completion >= 1) return 'bg-emerald-200 border-emerald-300'
  if (stat.completion > 0) return 'bg-emerald-100 border-emerald-200'
  return stat.date > today() ? 'bg-background opacity-50' : 'bg-background'
}

export default CalendarPage
