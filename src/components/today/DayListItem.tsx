import { useState } from 'react'
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
 * 今日页的补剂卡片（§8.1）。
 *
 * 四态图形与文案在 components/common/ItemStateView（日历详情共用同一份）；
 * 本组件只负责「这张卡长什么样、有什么操作」。
 *
 * 样式取自 Ardot 设计稿首页（3:1023）的四种卡片：
 *   待服用 白底 / 已服用 #F3FDF8 / 今天休息 #F8FAFC / 停用中 #F5F3FF，均为圆角 8 + 1px 边框
 *   顶行 = 20×20 图形槽 + 补剂名 14px Medium + 操作按钮（高 28）
 *   状态行 12px
 * 打卡按钮是深色实心（#343434 白字），不是主题主色 —— 一屏可能有 4 个打卡入口，
 * 用高饱和主色会把整页的视觉重心压在按钮上，而这一屏的主角是「今天吃什么」。
 */

/** 卡片底色（设计稿）：待服用保持纯白，它是待办、最需要被看见 */
const CARD_CLASS: Record<ItemState, string> = {
  pending: 'bg-card',
  taken: 'bg-[#F3FDF8]',
  rest: 'bg-slate-50',
  paused: 'bg-violet-50',
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
        // 失败要在卡片内展开提示，不进 Dialog、不弹窗（§8.1）
        setDuplicate(true)
      } else {
        toast((error as Error).message, { variant: 'destructive' })
      }
    } finally {
      setPending(false)
    }
  }

  /** 余量附录：设计稿的「待服用 1 粒 · 余量 34」。不吃项不显示余量（它跟今天无关） */
  const stock = supplement?.stockCount
  const showStock = !isOff && stock != null

  return (
    <div className={cn('flex flex-col gap-1.5 rounded-lg border p-3', CARD_CLASS[item.state])}>
      <div className="flex items-center gap-2">
        <span className="grid size-5 shrink-0 place-items-center">
          <StateSwatch state={item.state} />
        </span>

        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm font-medium',
            muted && 'text-muted-foreground',
          )}
        >
          {name}
        </span>

        {item.state === 'pending' ? (
          <Button
            size="sm"
            disabled={pending}
            className="h-7 shrink-0 rounded-[6px] bg-[#343434] px-3 text-xs font-medium text-white hover:bg-[#343434]/90"
            onClick={() => run(() => createIntake(baseInput('checkin')))}
          >
            {pending ? '记录中…' : '打卡'}
          </Button>
        ) : null}

        {item.state === 'taken' && item.recordIds.length > 0 ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-[6px] px-3 text-xs"
              disabled={pending}
              onClick={() => run(() => undoIntake(item.recordIds.at(-1)!))}
            >
              撤销
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 rounded-[6px] px-2 text-xs"
              disabled={pending}
              onClick={() => run(() => appendIntake(baseInput('extra')))}
            >
              追加一次
            </Button>
          </span>
        ) : null}

        {isOff ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground h-7 shrink-0 rounded-[6px] px-2.5 text-xs"
            disabled={pending}
            // P5：休息 / 停用期仍允许记录，不弹确认
            onClick={() => run(() => appendIntake(baseInput('forced')))}
          >
            仍要服用
          </Button>
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">
        <StateLine item={item} unit={unit} />
        {showStock ? (
          <>
            {' · 余量 '}
            <span className={cn('tabular-nums', stock < 0 && 'text-destructive font-medium')}>
              {stock}
            </span>
            {lowStock ? '（偏低）' : ''}
          </>
        ) : null}
      </p>

      {duplicate ? (
        <p className="flex items-center gap-2 text-xs text-amber-600">
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
  )
}

export default DayListItem
