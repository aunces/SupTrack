import { CALENDAR_MAX_DOTS } from '@/constants/enums'
import type { DailyIntake, DosagePlan, Supplement } from '@/types'
import { addDays } from './date'
import { resolveDayItems, resolveDayStatus, type DayStatus, type ItemState } from './dayState'
import type { PauseContext } from './pause'

/**
 * 月历推导（实施指导书 §8.4 / T-203）★ 纯函数。
 *
 * 从 useCalendarMonth 里抽出来的理由：这里全是判定，没有一处需要 db。
 * 判定能被单独钉死在某一天测（传 todayStr 而不是内部调 today()），
 * 否则「过去的待服项 = 漏服」这种规则只能靠肉眼看日历去验。
 */

/** 月历格上的状态点。「漏服」不是 ItemState，是「过去某天还没被记录的应服项」的呈现态 */
export type CalendarDot = ItemState | 'missed'

export interface CalendarDay {
  date: string
  /** 日号（1–31） */
  day: number
  /** 属于当前显示的月份；邻月补位格为 false（不可点） */
  inMonth: boolean
  status: DayStatus
  /** 最多 CALENDAR_MAX_DOTS 个；颜色沿用四态色（§8.4） */
  dots: CalendarDot[]
  /** 被省略的个数，渲染成 `+N`（W-05） */
  hiddenDotCount: number
  isToday: boolean
  isFuture: boolean
}

/** 月历固定 6 行 —— 高度不随月份跳变（5 行的月份会让下半页内容上下窜一次） */
export const CALENDAR_ROWS = 6
export const CALENDAR_CELLS = CALENDAR_ROWS * 7

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function monthFirstDay(year: number, month: number): string {
  return `${year}-${pad2(month)}-01`
}

/**
 * 该月最后一天。`new Date(y, m, 0)` 取「下月第 0 天」= 本月最后一天，
 * 闰年与大小月都不用维护表。
 */
export function monthLastDay(year: number, month: number): string {
  const last = new Date(year, month, 0).getDate()
  return `${year}-${pad2(month)}-${pad2(last)}`
}

/** 月历首格日期：补齐到周一起始（中文习惯），最多补 6 天 */
export function gridStart(year: number, month: number): string {
  const weekday = new Date(year, month - 1, 1).getDay() // 0 = 周日
  const mondayOffset = (weekday + 6) % 7
  return addDays(monthFirstDay(year, month), -mondayOffset)
}

export interface CalendarGridInput {
  year: number
  month: number
  /**
   * 计划清单。可以传全部计划，也可以只传启用的 —— 函数内部只取 `isActive`（幂等）。
   * 「关闭的计划不参与月历」这条规则属于推导层，不让每个调用方自己记得过滤。
   */
  plans: DosagePlan[]
  supplements: Map<string, Supplement>
  /** 覆盖整个 6 周网格的记录 */
  records: DailyIntake[]
  pauseCtx: PauseContext
  /** 注入「今天」，让规则可测（纯函数不读时钟） */
  todayStr: string
}

export function buildCalendarDays(input: CalendarGridInput): CalendarDay[] {
  const { year, month, supplements, records, pauseCtx, todayStr } = input
  const plans = input.plans.filter((plan) => plan.isActive)

  const recordsByDate = new Map<string, DailyIntake[]>()
  for (const record of records) {
    const list = recordsByDate.get(record.date)
    if (list) list.push(record)
    else recordsByDate.set(record.date, [record])
  }

  const first = monthFirstDay(year, month)
  const last = monthLastDay(year, month)
  const start = gridStart(year, month)
  const days: CalendarDay[] = []

  for (let i = 0; i < CALENDAR_CELLS; i++) {
    const date = addDays(start, i)
    const items = resolveDayItems({
      date,
      plans,
      supplements,
      records: recordsByDate.get(date) ?? [],
      pauseCtx,
    })

    const dots: CalendarDot[] = items.map((item) =>
      // ★ 过去的「还没记录」= 漏服；今天的仍然是「待服用」，还没到怪自己的时候。
      //   漏服不是存出来的字段，是「应服日 + 没有记录 + 已经过去」三个条件现算的（§8.4）
      item.state === 'pending' && date < todayStr ? 'missed' : item.state,
    )

    days.push({
      date,
      day: Number(date.slice(8, 10)),
      inMonth: date >= first && date <= last,
      status: resolveDayStatus(items),
      dots: dots.slice(0, CALENDAR_MAX_DOTS),
      hiddenDotCount: Math.max(0, dots.length - CALENDAR_MAX_DOTS),
      isToday: date === todayStr,
      isFuture: date > todayStr,
    })
  }

  return days
}
