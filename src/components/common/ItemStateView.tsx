import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { INTAKE_ORIGIN } from '@/constants/enums'
import { formatShortDate, formatTime } from '@/utils/date'
import type { DayItem, ItemState } from '@/utils/dayState'

/**
 * 四态图形与文案（§8.1 / §8.4）—— 今日页与日历详情**共用这一份**。
 *
 * 从 DayListItem 里抽出来的唯一理由：日历右栏要「与今日页同一套文案组件」（§8.4）。
 * 如果两处各写一遍，迟早会出现今日页说「今天不用吃」、日历说「休息」这种
 * 同一件事两种说法的情况。
 *
 * 四态必须**同时用三个维度**区分：颜色 + 图形 + 文案。
 * 图形是四种不同的**形状**（实心点 / 对勾圆 / 虚线圆 / 斜纹方块）而不是同一个圆换颜色 ——
 * 色盲、灰度打印、缩放场景下，形状是唯一还活着的区分通道。
 */

export function StateSwatch({ state }: { state: ItemState }) {
  if (state === 'pending') {
    return <span className="size-2.5 rounded-full bg-amber-500" aria-hidden />
  }
  if (state === 'taken') {
    return (
      <span className="grid size-4 place-items-center rounded-full bg-emerald-500" aria-hidden>
        <Check className="size-3 text-white" strokeWidth={3} />
      </span>
    )
  }
  if (state === 'rest') {
    return (
      <span
        className="size-3.5 rounded-full border-[1.5px] border-dashed border-slate-400"
        aria-hidden
      />
    )
  }
  return <span className="swatch-paused" aria-hidden />
}

/** 状态文案。P1：「休息」与「停用」是两个不同的词；P2：不吃项必须给出下一个该吃的日期 */
export function StateLine({ item, unit }: { item: DayItem; unit: string }) {
  if (item.state === 'pending') {
    return (
      <>
        待服用 {item.amountDue} {unit}
      </>
    )
  }

  if (item.state === 'taken') {
    const extras: ReactNode[] = []
    if (item.origin === INTAKE_ORIGIN.BACKFILL) {
      // 补录没有「服用时刻」这回事 —— createdAt 只是**录入**时间。
      // 把它当服用时间显示出来会是一句假话，所以这里改标来源（R-16 可溯源）。
      extras.push('补录')
    } else if (item.lastTakenAt) {
      extras.push(formatTime(item.lastTakenAt))
    }
    // 休息日 / 停用期仍要服用时，必须标来源，否则用户会以为自己记错了
    if (item.pause) extras.push('停用期服用')
    else if (item.offScheduleTake) extras.push('休息日服用')
    return (
      <>
        已服用 {item.takenAmount} {unit}
        {extras.length > 0 ? ` · ${extras.join(' · ')}` : ''}
      </>
    )
  }

  if (item.state === 'rest') {
    return (
      <>
        今天不用吃
        {item.nextRateDate ? (
          <>
            {' · '}
            <span className="text-foreground font-medium">
              下次 {formatShortDate(item.nextRateDate)}
            </span>
          </>
        ) : null}
      </>
    )
  }

  const resume = item.pause?.resumeDate
  return (
    <>
      停用中
      {item.pause ? ` · ${item.pause.reasonLabel}` : ''}
      {' · '}
      <span className="text-foreground font-medium">
        {resume ? `${formatShortDate(resume)} 恢复` : '持续中'}
      </span>
    </>
  )
}
