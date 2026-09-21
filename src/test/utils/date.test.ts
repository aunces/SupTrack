import { describe, expect, it } from 'vitest'
import {
  addDays,
  backfillRange,
  DATE_FORMAT,
  diffCalendarDays,
  formatDate,
  formatDateLabel,
  formatShortDate,
  isValidDate,
  today,
  yesterday,
} from '@/utils/date'

describe('addDays', () => {
  it('跨月', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
  })

  it('跨年', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('负数往前推', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('闰年 2 月', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
  })

  it('加 0 不变', () => {
    expect(addDays('2026-09-20', 0)).toBe('2026-09-20')
  })
})

describe('diffCalendarDays', () => {
  it('to 晚于 from 为正', () => {
    expect(diffCalendarDays('2026-09-20', '2026-09-25')).toBe(5)
  })

  it('to 早于 from 为负', () => {
    expect(diffCalendarDays('2026-09-25', '2026-09-20')).toBe(-5)
  })

  it('同一天为 0', () => {
    expect(diffCalendarDays('2026-09-20', '2026-09-20')).toBe(0)
  })

  it('跨月跨年正确', () => {
    expect(diffCalendarDays('2026-09-30', '2026-10-02')).toBe(2)
    expect(diffCalendarDays('2026-12-31', '2027-01-01')).toBe(1)
  })
})

describe('formatShortDate', () => {
  it('月日不带前导零', () => {
    expect(formatShortDate('2026-09-02')).toBe('9/2')
    expect(formatShortDate('2026-12-25')).toBe('12/25')
  })
})

describe('formatDateLabel', () => {
  it('中文短日期 + 星期', () => {
    expect(formatDateLabel('2026-09-20')).toBe('9月20日 周日')
    expect(formatDateLabel('2026-09-21')).toBe('9月21日 周一')
  })
})

describe('backfillRange', () => {
  it('窗口固定 7 天且不含今天', () => {
    const { min, max } = backfillRange()
    expect(max).toBe(yesterday())
    expect(min).toBe(addDays(today(), -7))
    expect(diffCalendarDays(min, max)).toBe(6)
  })
})

describe('formatDate / today', () => {
  it('统一 yyyy-MM-dd', () => {
    expect(DATE_FORMAT).toBe('yyyy-MM-dd')
    expect(formatDate(new Date(2026, 8, 20))).toBe('2026-09-20')
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('isValidDate', () => {
  it('合法 yyyy-MM-dd 通过', () => {
    expect(isValidDate('2026-09-20')).toBe(true)
  })

  it('其它格式与乱码被拒', () => {
    expect(isValidDate('2026/09/20')).toBe(false)
    expect(isValidDate('不是日期')).toBe(false)
  })
})
