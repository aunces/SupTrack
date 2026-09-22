import { describe, expect, it } from 'vitest'
import type { DailyIntake, DosagePlan, PausePeriod, Supplement } from '@/types'
import {
  buildCalendarDays,
  countMonthStatus,
  gridStart,
  monthFirstDay,
  monthLastDay,
  type CalendarDay,
} from '@/utils/calendar'
import type { PauseContext } from '@/utils/pause'

/**
 * 月历推导（§8.4 / T-210）。
 *
 * 2026-09-01 是周二，所以这个月的首格是 08-31（周一）。
 * 「今天」固定为 2026-09-22 并注入 —— 纯函数不读时钟，否则这些用例过一周就全红了。
 */
const TODAY = '2026-09-22'

function supplement(id: string): Supplement {
  return {
    id,
    name: `补剂 ${id}`,
    unitType: 'pill',
    stockCount: null,
    stockUnit: null,
    unitsPerStock: null,
    expiryDate: null,
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }
}

function plan(id: string, supplementId: string, overrides: Partial<DosagePlan> = {}): DosagePlan {
  return {
    id,
    supplementId,
    amountPerTime: 1,
    timeSlots: ['morning'],
    rateMode: 'daily',
    rateOnDays: null,
    rateOffDays: null,
    rateAnchorDate: null,
    isActive: true,
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

/** 用户语言里的「每 7 天一次」= on 1 / off 6 */
function weekly(id: string, anchor: string, slots: DosagePlan['timeSlots']): DosagePlan {
  return plan(id, id, {
    timeSlots: slots,
    rateMode: 'cyclic',
    rateOnDays: 1,
    rateOffDays: 6,
    rateAnchorDate: anchor,
  })
}

function record(
  id: string,
  date: string,
  supplementId: string,
  timeSlot: 'morning' | 'evening' = 'morning',
  taken = true,
): DailyIntake {
  return {
    id,
    date,
    supplementId,
    planId: null,
    timeSlot,
    amount: 1,
    taken,
    isExtra: false,
    origin: 'checkin',
    notes: null,
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
  }
}

function pause(
  id: string,
  supplementId: string,
  startDate: string,
  endDate: string | null,
): PausePeriod {
  return {
    id,
    schemeId: null,
    supplementId,
    startDate,
    endDate,
    reason: null,
    createdAt: `${startDate}T00:00:00.000Z`,
    updatedAt: `${startDate}T00:00:00.000Z`,
  }
}

function runGrid(input: {
  plans: DosagePlan[]
  records?: DailyIntake[]
  periods?: PausePeriod[]
  todayStr?: string
}): CalendarDay[] {
  const supplements = input.plans.map((p) => supplement(p.supplementId))
  const pauseCtx: PauseContext = { periods: input.periods ?? [], schemes: new Map() }
  return buildCalendarDays({
    year: 2026,
    month: 9,
    plans: input.plans,
    supplements: new Map(supplements.map((s) => [s.id, s])),
    records: input.records ?? [],
    pauseCtx,
    todayStr: input.todayStr ?? TODAY,
  })
}

function byDate(days: CalendarDay[], date: string): CalendarDay {
  const found = days.find((day) => day.date === date)
  if (!found) throw new Error(`网格里没有 ${date}`)
  return found
}

describe('月历网格结构', () => {
  it('首格补齐到周一；末整行邻月被裁掉（2026-09 → 5 行 35 格）', () => {
    const days = runGrid({ plans: [] })
    expect(days).toHaveLength(35)
    expect(days[0].date).toBe('2026-08-31')
    expect(days[0].inMonth).toBe(false)
    expect(gridStart(2026, 9)).toBe('2026-08-31')
  })

  it('月末与网格末尾正确（9 月 30 天 → 末格 10-04，10/05–11 整行邻月被裁）', () => {
    const days = runGrid({ plans: [] })
    expect(monthFirstDay(2026, 9)).toBe('2026-09-01')
    expect(monthLastDay(2026, 9)).toBe('2026-09-30')
    expect(days[days.length - 1].date).toBe('2026-10-04')
    expect(days[days.length - 1].inMonth).toBe(false)
  })

  it('整行都落在下个月的补位格不整行显示，与当月同一行的邻月格保留', () => {
    const days = runGrid({ plans: [] })
    // 末行 = 09-28 … 10-04（含 9 月日期）→ 保留；其后的 10-05 … 10-11 整行删掉
    expect(days.some((d) => d.date === '2026-10-05')).toBe(false)
    expect(days.some((d) => d.date === '2026-10-11')).toBe(false)
    // 跟当月同处一行的邻月补位格照常显示（用户允许「在一起一行就行」）
    expect(days.some((d) => d.date === '2026-10-01')).toBe(true)
    expect(days.some((d) => d.date === '2026-08-31')).toBe(true)
  })

  it('2 月按闰年取天数（不维护月份天数表）', () => {
    expect(monthLastDay(2028, 2)).toBe('2028-02-29')
    expect(monthLastDay(2026, 2)).toBe('2026-02-28')
  })

  it('日期连续、不重复，inMonth 只落在本月', () => {
    const days = runGrid({ plans: [] })
    expect(new Set(days.map((d) => d.date)).size).toBe(days.length)
    expect(days.filter((d) => d.inMonth)).toHaveLength(30)
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(`${days[i - 1].date}T00:00:00`).getTime()
      const curr = new Date(`${days[i].date}T00:00:00`).getTime()
      expect(curr - prev).toBe(86400000)
    }
  })

  it('isToday 只命中一天，isFuture 按注入的今天判定', () => {
    const days = runGrid({ plans: [] })
    expect(days.filter((d) => d.isToday).map((d) => d.date)).toEqual([TODAY])
    expect(byDate(days, '2026-09-21').isFuture).toBe(false)
    expect(byDate(days, '2026-09-22').isFuture).toBe(false)
    expect(byDate(days, '2026-09-23').isFuture).toBe(true)
  })
})

describe('五种日级状态同屏可辨（§13.3 M2 判据）', () => {
  /**
   * 把五项错开：每项都是「每 7 天一次」，锚点各差一天。
   * 因为锚点之前的补剂根本不出现（isBeforeRateAnchor），
   * 所以 9/10~9/14 每天**只有一项**在应服清单里 —— 状态不会互相污染。
   */
  const grid = runGrid({
    plans: [
      weekly('s-done', '2026-09-10', ['morning', 'evening']),
      weekly('s-partial', '2026-09-11', ['morning', 'evening']),
      weekly('s-missed', '2026-09-12', ['morning']),
      weekly('s-paused', '2026-09-13', ['morning']),
      // 锚点 9/8 → 9/14 已过锚点但不在该吃日，正好落在「今天休息」
      weekly('s-rest', '2026-09-08', ['morning']),
    ],
    records: [
      record('r1', '2026-09-10', 's-done', 'morning'),
      record('r2', '2026-09-10', 's-done', 'evening'),
      record('r3', '2026-09-11', 's-partial', 'morning'),
    ],
    periods: [pause('pp1', 's-paused', '2026-09-13', '2026-09-13')],
  })

  it('done / partial / missed / paused / rest 五种并存且各自可辨', () => {
    expect(byDate(grid, '2026-09-10').status).toBe('done')
    expect(byDate(grid, '2026-09-11').status).toBe('partial')
    expect(byDate(grid, '2026-09-12').status).toBe('missed')
    expect(byDate(grid, '2026-09-13').status).toBe('paused')
    expect(byDate(grid, '2026-09-14').status).toBe('rest')
  })

  it('五种状态在同一个月里都真的出现过（不是构造出来的巧合）', () => {
    const seen = new Set(grid.map((day) => day.status))
    expect(seen.has('done')).toBe(true)
    expect(seen.has('partial')).toBe(true)
    expect(seen.has('missed')).toBe(true)
    expect(seen.has('paused')).toBe(true)
    expect(seen.has('rest')).toBe(true)
  })
})

describe('状态点：形状/颜色来源互不相同', () => {
  it('done → 全部 taken 点', () => {
    const days = runGrid({
      plans: [plan('p1', 's1', { timeSlots: ['morning', 'evening'] })],
      records: [
        record('r1', '2026-09-10', 's1', 'morning'),
        record('r2', '2026-09-10', 's1', 'evening'),
      ],
    })
    expect(byDate(days, '2026-09-10').status).toBe('done')
    expect(byDate(days, '2026-09-10').dots).toEqual(['taken', 'taken'])
  })

  it('partial → 已吃 + 漏服 两种点并存', () => {
    const days = runGrid({
      plans: [plan('p1', 's1', { timeSlots: ['morning', 'evening'] })],
      records: [record('r1', '2026-09-10', 's1', 'morning')],
    })
    expect(byDate(days, '2026-09-10').status).toBe('partial')
    expect(byDate(days, '2026-09-10').dots).toEqual(['taken', 'missed'])
  })

  it('missed → missed 点', () => {
    const days = runGrid({ plans: [plan('p1', 's1')] })
    expect(byDate(days, '2026-09-21').dots).toEqual(['missed'])
  })

  it('paused → paused 点（与其他三种形状不同源）', () => {
    const days = runGrid({
      plans: [plan('p1', 's1')],
      periods: [pause('pp1', 's1', '2026-09-21', '2026-09-21')],
    })
    expect(byDate(days, '2026-09-21').dots).toEqual(['paused'])
    expect(byDate(days, '2026-09-21').status).toBe('paused')
  })

  it('rest → rest 点', () => {
    const days = runGrid({
      plans: [
        plan('p1', 's1', {
          rateMode: 'cyclic',
          rateOnDays: 1,
          rateOffDays: 1,
          rateAnchorDate: '2026-09-12',
        }),
      ],
    })
    expect(byDate(days, '2026-09-13').dots).toEqual(['rest'])
    expect(byDate(days, '2026-09-13').status).toBe('rest')
  })
})

describe('漏服是现算的，不是存的字段', () => {
  it('过去的应服项没记录 → missed', () => {
    const days = runGrid({ plans: [plan('p1', 's1')] })
    expect(byDate(days, '2026-09-21').status).toBe('missed')
  })

  it('今天的应服项没记录 → 点仍是 pending，不提前渲染成漏服', () => {
    const days = runGrid({ plans: [plan('p1', 's1')] })
    expect(byDate(days, TODAY).dots).toEqual(['pending'])
    // resolveDayStatus 只知道「有应服项且没吃」，不知道「今天还没过完」，所以它是 missed；
    // 日历格渲染的是**点**而不是 status，因此今天显示的是琥珀色「待服用」。
  })

  it('补上一条记录后同一天就不再是漏服（没有任何状态位需要更新）', () => {
    const before = runGrid({ plans: [plan('p1', 's1')] })
    expect(byDate(before, '2026-09-21').status).toBe('missed')

    const after = runGrid({
      plans: [plan('p1', 's1')],
      records: [record('r1', '2026-09-21', 's1')],
    })
    expect(byDate(after, '2026-09-21').status).toBe('done')
  })

  it('补一条 taken=false（补录漏服）→ 仍是 missed，不会变成 done', () => {
    const days = runGrid({
      plans: [plan('p1', 's1')],
      records: [record('r1', '2026-09-21', 's1', 'morning', false)],
    })
    expect(byDate(days, '2026-09-21').status).toBe('missed')
  })
})

describe('状态点上限（W-05）', () => {
  it('超过 3 个应服项 → 3 个点 + hiddenDotCount 记剩余', () => {
    const days = runGrid({
      plans: ['a', 'b', 'c', 'd', 'e'].map((id) => plan(`p-${id}`, `s-${id}`)),
    })
    const day = byDate(days, '2026-09-21')
    expect(day.dots).toHaveLength(3)
    expect(day.hiddenDotCount).toBe(2)
  })

  it('正好 3 个应服项 → 不显示 +N', () => {
    const days = runGrid({ plans: ['a', 'b', 'c'].map((id) => plan(`p-${id}`, `s-${id}`)) })
    expect(byDate(days, '2026-09-21').dots).toHaveLength(3)
    expect(byDate(days, '2026-09-21').hiddenDotCount).toBe(0)
  })
})

describe('与今日页共用同一套判定', () => {
  it('关闭的计划不参与月历（即便调用方把全部计划都传进来）', () => {
    const days = runGrid({
      plans: [plan('p-off', 's-off', { isActive: false }), plan('p-on', 's-on')],
    })
    // 只应看到启用中的那一个
    expect(byDate(days, '2026-09-21').dots).toEqual(['missed'])
  })

  it('节奏起点之前的日期不出现该补剂（与今日页一致）', () => {
    const days = runGrid({
      plans: [
        plan('p1', 's1', {
          rateMode: 'cyclic',
          rateOnDays: 1,
          rateOffDays: 1,
          rateAnchorDate: '2026-09-21',
        }),
      ],
    })
    expect(byDate(days, '2026-09-20').dots).toEqual([])
    expect(byDate(days, '2026-09-21').dots).toEqual(['missed'])
  })

  it('停用区间之外恢复正常', () => {
    const days = runGrid({
      plans: [plan('p1', 's1')],
      periods: [pause('pp1', 's1', '2026-09-20', null)],
    })
    expect(byDate(days, '2026-09-21').status).toBe('paused')
    expect(byDate(days, '2026-09-19').status).not.toBe('paused')
  })
})

describe('countMonthStatus · 当月「已记 / 漏服」天数（§8.4 设计 3:318 标题统计行）', () => {
  it('没有启用计划 → 已记与漏服都为 0', () => {
    expect(countMonthStatus(runGrid({ plans: [] }))).toEqual({ taken: 0, missed: 0 })
  })

  it('只统计 inMonth 的格 —— 邻月补位格不进任何计数', () => {
    const days = runGrid({ plans: [plan('p1', 's1')] })
    const full = countMonthStatus(days)
    const inMonthOnly = countMonthStatus(days.filter((d) => d.inMonth))
    expect(full).toEqual(inMonthOnly)
  })

  it('已记 = 有 taken 点在月内天数；漏服 = 有 missed 点在月内天数', () => {
    const days = runGrid({
      plans: [plan('p1', 's1')],
      records: [record('r1', '2026-09-10', 's1'), record('r2', '2026-09-11', 's1')],
    })
    const result = countMonthStatus(days)
    expect(result.taken).toBe(2)
    expect(result.missed).toBe(days.filter((d) => d.inMonth && d.dots.includes('missed')).length)
  })

  it('部分完成的一天（taken + missed 并存）同时计入两栏', () => {
    const days = runGrid({
      plans: [plan('p1', 's1', { timeSlots: ['morning', 'evening'] })],
      records: [record('r1', '2026-09-10', 's1', 'morning')],
    })
    expect(byDate(days, '2026-09-10').dots).toEqual(['taken', 'missed'])
    const result = countMonthStatus(days)
    expect(result.taken).toBe(1)
    expect(result.missed).toBe(days.filter((d) => d.inMonth && d.dots.includes('missed')).length)
  })
})
