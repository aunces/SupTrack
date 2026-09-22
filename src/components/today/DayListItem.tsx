import { type ReactNode, useState } from 'react'
import { StateLine, StateSwatch } from '@/components/common/ItemStateView'
import { Button } from '@/components/ui/button'
import { UNIT_TYPE_LABEL } from '@/constants/units'
import {
  DuplicateIntakeError,
  appendIntake,
  createIntake,
  undoIntake,
} from '@/services/intakeService'
import { toast } from '@/stores/toastStore'
import type { DayItem, ItemState } from '@/utils/dayState'
import { cn } from 'cn'

/**
 * 今日页单行（§8.1）。
 *
 * 四态图形与文案在 components/common/ItemStateView（日历详情共用同一份）。
 * 本组件只负责「这一行有什么操作」——打卡 / 撤销 / 追加一次 / 仍要服用。
 */

/** 行底色（极淡）：待服用保持白（它是待办，最需要被看见） */
const ROW_CLASS: Record<ItemState, string> = {
  pending: '',
  taken: 'bg-emerald-50/60',
  rest: 'bg-slate-50',
  paused: 'bg-violet-50',
}

function amountLabel(item: DayItem, lowStock: boolean): ReactNode {
  const supplement = item.supplement
  if (!supplement || supplement.stockCount == null) return null
  const negative = supplement.stockCount < 0
  return (
    <span className={cn(negative && 'text-destructive font-medium')}>
      {' · 余量 '}
      <span className="tabular-nums">{supplement.stockCount}</span>
      {lowStock ? '（偏低）' : ''}
    </span>
  )
}

interface DayListItemProps {
  item: DayItem
  lowStock: boolean
}

export function DayListItem({ item, lowStock }: DayListItemProps) {
  const [pending, setPending] = useState(false)
  const [duplicate, setDuplicate] = useState(false)

  const supplement = item.supplement
  const name = supplement?.name ?? '[已删除的补剂]'
  const unit = supplement ? UNIT_TYPE_LABEL[supplement.unitType] : '份'
  const isOff = item.state === 'rest' || item.state === 'paused'
  const muted = item.state === 'taken' || isOff

  function baseInput(origin: 'checkin' | 'extra' | 'forced') {
    return {
      date: item.date,
      supplementId: item.supplementId,
      planId: item.planId || null,
      timeSlot: item.timeSlot,
      amount: item.amountDue > 0 ? item.amountDue : 1,
      origin,
    }
  }

  async function run(action: () => Promise<unknown>) {
    setPending(true)
    try {
      await action()
    } catch (error) {
      if (error instanceof DuplicateIntakeError) {
        // 失败要在行内展开提示，不进 Dialog、不弹窗（§8.1）
        setDuplicate(true)
      } else {
        toast((error as Error).message, { variant: 'destructive' })
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      className={cn(
        'grid grid-cols-[24px_1fr_auto] items-center gap-3 px-4 py-2.5',
        ROW_CLASS[item.state],
      )}
    >
      <span className="grid place-items-center">
        <StateSwatch state={item.state} />
      </span>

      <div className="min-w-0">
        <p className={cn('truncate text-sm font-medium', muted && 'text-muted-foreground')}>
          {name}
        </p>
        <p
          className={cn(
            'truncate text-xs',
            muted ? 'text-muted-foreground' : 'text-muted-foreground',
          )}
        >
          <StateLine item={item} unit={unit} />
          {!isOff ? amountLabel(item, lowStock) : null}
        </p>
        {duplicate ? (
          <p className="mt-1 flex items-center gap-2 text-xs text-amber-600">
            今天已打卡
            <Button
              size="xs"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => appendIntake(baseInput('extra')))}
            >
              追加一次
            </Button>
          </p>
        ) : null}
      </div>

      {/* 操作列固定宽度：鼠标纵向移动时按钮位置不漂移（PC 端可用性关键） */}
      <div className="flex w-44 shrink-0 items-center justify-end gap-2">
        {item.state === 'pending' ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => createIntake(baseInput('checkin')))}
          >
            {pending ? '记录中…' : '打卡'}
          </Button>
        ) : null}

        {item.state === 'taken' && item.recordIds.length > 0 ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => appendIntake(baseInput('extra')))}
            >
              追加一次
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => undoIntake(item.recordIds.at(-1)!))}
            >
              撤销
            </Button>
          </>
        ) : null}

        {isOff ? (
          <Button
            size="xs"
            variant="ghost"
            disabled={pending}
            // P5：休息 / 停用期仍允许记录，不弹确认
            onClick={() => run(() => appendIntake(baseInput('forced')))}
          >
            仍要服用
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export default DayListItem
