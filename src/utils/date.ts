import {
  addDays as addDaysFns,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
  subDays,
} from 'date-fns'
import { BACKFILL_WINDOW_DAYS, EXPIRY_WARNING_DAYS } from '@/constants/enums'

/**
 * 日期工具（实施指导书 §6.1）。
 *
 * R-10：日期一律用 'yyyy-MM-dd' 本地日期字符串，时间戳用 ISO 8601，禁止混用。
 * 已删除旧的 `shiftDays` —— 名字像「偏移」但实现是往前减，语义反直觉；
 * 一律改用语义明确的 `addDays(date, n)`。
 */

export const DATE_FORMAT = 'yyyy-MM-dd'

const WEEKDAY_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

export function formatDate(date: Date): string {
  return format(date, DATE_FORMAT)
}

export function today(): string {
  return formatDate(new Date())
}

export function yesterday(): string {
  return formatDate(subDays(new Date(), 1))
}

/** date 之后 n 天（n 可为负） */
export function addDays(date: string, n: number): string {
  return formatDate(addDaysFns(parseISO(date), n))
}

/** 两个日期之间的日历天数差（to - from） */
export function diffCalendarDays(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from))
}

/** 中文短日期展示，如「9月20日 周日」 */
export function formatDateLabel(date: string): string {
  const d = parseISO(date)
  return `${format(d, 'M月d日')} ${WEEKDAY_LABEL[d.getDay()]}`
}

/** 短日期展示，如「9/22」（月日无前导零） */
export function formatShortDate(date: string): string {
  return format(parseISO(date), 'M/d')
}

/** 24 小时制时间，如「08:12」。入参是 ISO 时间戳 */
export function formatTime(iso: string): string {
  return format(new Date(iso), 'HH:mm')
}

/** 补录可选范围 [today-7, yesterday]。窗口固定 7 天，不可配置（D-07） */
export function backfillRange(): { min: string; max: string } {
  return { min: addDays(today(), -BACKFILL_WINDOW_DAYS), max: yesterday() }
}

/** 服用日期与录入时间不是同一天 → UI 标「补录」 */
export function isBackfill(date: string, createdAt: string): boolean {
  return date !== formatDate(new Date(createdAt))
}

export function daysUntil(date: string): number {
  return diffCalendarDays(today(), date)
}

/** 临期判断：过期日期在 threshold 天内（含已过期） */
export function isExpiringSoon(
  expiryDate: string | null,
  threshold = EXPIRY_WARNING_DAYS,
): boolean {
  if (!expiryDate) return false
  return daysUntil(expiryDate) <= threshold
}

export function isValidDate(value: string): boolean {
  return isValid(parseISO(value))
}
