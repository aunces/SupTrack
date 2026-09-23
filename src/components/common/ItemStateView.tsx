import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { INTAKE_ORIGIN } from '@/constants/enums'
import { formatShortDate, formatTime, today } from '@/utils/date'
import type { DayItem, ItemState } from '@/utils/dayState'

/**
 * 四态图形与文案（§8.1 / §8.4）—— 今日页、日历详情、补剂卡片**共用这一份**。
 *
 * 四态必须**同时用三个维度**区分：颜色 + 图形 + 文案。
 * 图形是四种不同的**形状**（实心点 / 对勾圆 / 虚线圆 / 斜纹方块）而不是同一个圆换颜色 ——
 * 色盲、灰度打印、缩放场景下，形状是唯一还活着的区分通道。
 *
 * 尺寸按 Ardot 设计稿（卡片 20×20 图形槽）：实心点 8、对勾圆 13.3、休息圈 11、停用方块 11.7。
 *
 * ⚠ 与设计稿的一处差异：设计稿的「今天休息」是**实线描边圆**，这里按实施指导书 §5.2
 *   「虚线圆」实现（用户口径：与 UI 冲突时以指导书为准）。11px 下两者的观感差别很小，
 *   但形状语义是四态区分的主通道，不擅自改成实线。
 */

export function StateSwatch({ state }: { state: ItemState }) {
  if (state === 'pending') {
    return <span className="size-2 rounded-full bg-amber-500" aria-hidden />
  }
  if (state === 'taken') {
    return (
      <span className="grid size-3.5 place-items-center rounded-full bg-emerald-500" aria-hidden>
        <Check className="size-2.5 text-white" strokeWidth={3} />
      </span>
    )
  }
  if (state === 'rest') {
    return (
      <span
        className="size-3 rounded-full border-[1.5px] border-dashed border-slate-400"
        aria-hidden
      />
    )
  }
  return <span className="swatch-paused" aria-hidden />
}

/**
 * 状态文案。P1：「休息」与「停用」是两个不同的词；P2：不吃项必须给出下一个该吃的日期。
 *
 * 颜色按 Ardot 设计稿写在各段里（不靠父节点传色）：
 *   休息：「今天不用吃」slate-400，「下次 9/22」slate-600 加粗（P2 的落点）
 *   停用：「停用中」violet-600，原因与恢复日用中性灰
 *
 * L-4：本组件在今日页与日历详情**共用**，而后者的 date 可能是任意历史日期。
 * 所以「今天」不能写死 —— 只有 item.date 就是今天时才说「今天不用吃」，
 * 历史日期说「该日不用吃」（例：翻回 9/17 看到的是「该日不用吃」而不是「今天不用吃」）。
 */
export function StateLine({ item, unit }: { item: DayItem; unit: string }) {
  const isToday = item.date === today()
  const restLabel = isToday ? '今天不用吃' : '该日不用吃'

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
        <span className="text-slate-400">{restLabel}</span>
        {item.nextRateDate ? (
          <>
            <span className="text-slate-400">{' · '}</span>
            <span className="font-semibold text-slate-600">
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
      <span className="text-violet-600">停用中</span>
      <span className="text-muted-foreground">
        {item.pause ? ` · ${item.pause.reasonLabel}` : ''}
        {' · '}
        {resume ? `${formatShortDate(resume)} 恢复` : '持续中'}
      </span>
    </>
  )
}
