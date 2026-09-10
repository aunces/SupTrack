import { differenceInCalendarDays, format, isValid, parseISO, subDays } from 'date-fns'
import { DEFAULT_EXPIRY_WARNING_DAYS } from '@/constants/enums'

export const DATE_FORMAT = 'yyyy-MM-dd'

export function formatDate(date: Date): string {
  return format(date, DATE_FORMAT)
}

export function today(): string {
  return formatDate(new Date())
}

export function yesterday(): string {
  return formatDate(subDays(new Date(), 1))
}

export function shiftDays(date: string, days: number): string {
  return formatDate(subDays(parseISO(date), days))
}

/** 补录标注：服用日期与录入时间不是同一天 */
export function isBackfill(date: string, createdAt: string): boolean {
  return date !== formatDate(new Date(createdAt))
}

/** 补录可选范围：[today - windowDays, yesterday] */
export function backfillRange(backfillWindowDays: number): { min: string; max: string } {
  return {
    min: formatDate(subDays(new Date(), backfillWindowDays)),
    max: yesterday(),
  }
}

export function daysUntil(date: string): number {
  const target = parseISO(date)
  const startOfToday = parseISO(formatDate(new Date()))
  return differenceInCalendarDays(target, startOfToday)
}

/** 临期判断：过期日期在 threshold 天内（含已过期） */
export function isExpiringSoon(
  expiryDate: string | null | undefined,
  threshold = DEFAULT_EXPIRY_WARNING_DAYS,
): boolean {
  if (!expiryDate) return false
  return daysUntil(expiryDate) <= threshold
}

export function isValidDate(value: string): boolean {
  return isValid(parseISO(value))
}

export function isoDateToStartOfDay(date: string): string {
  return `${date}T00:00:00.000Z`
}

export function isoDateToEndOfDay(date: string): string {
  return `${date}T23:59:59.999Z`
}
