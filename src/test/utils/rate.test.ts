import { describe, expect, it } from 'vitest'
import type { DosagePlan } from '@/types'
import {
  describeRate,
  isRateConfigValid,
  matchesRate,
  nextRateDate,
  rateDensity,
} from '@/utils/rate'

function plan(overrides: Partial<DosagePlan> = {}): DosagePlan {
  return {
    id: 'plan-1',
    supplementId: 'supp-1',
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

/** 隔天：锚点 2026-09-25 */
const everyOther = plan({
  rateMode: 'cyclic',
  rateOnDays: 1,
  rateOffDays: 1,
  rateAnchorDate: '2026-09-25',
})

/** 吃 5 停 2：锚点 2026-09-25 */
const onOff = plan({
  rateMode: 'cyclic',
  rateOnDays: 5,
  rateOffDays: 2,
  rateAnchorDate: '2026-09-25',
})

describe('matchesRate', () => {
  it('daily 模式恒为该吃', () => {
    expect(matchesRate(plan(), '2026-09-20')).toBe(true)
    expect(matchesRate(plan(), '2030-01-01')).toBe(true)
  })

  it('锚点是未来 → 该日不出现，且不报错', () => {
    expect(matchesRate(everyOther, '2026-09-20')).toBe(false)
  })

  it('锚点当天算周期第 1 个该吃日', () => {
    expect(matchesRate(everyOther, '2026-09-25')).toBe(true)
  })

  it('隔天：第 2 天休息、第 3 天该吃', () => {
    expect(matchesRate(everyOther, '2026-09-26')).toBe(false)
    expect(matchesRate(everyOther, '2026-09-27')).toBe(true)
  })

  it('吃 5 停 2：第 6、7 天休息，第 8 天该吃', () => {
    expect(matchesRate(onOff, '2026-09-25')).toBe(true) // 第 1 天
    expect(matchesRate(onOff, '2026-09-29')).toBe(true) // 第 5 天
    expect(matchesRate(onOff, '2026-09-30')).toBe(false) // 第 6 天
    expect(matchesRate(onOff, '2026-10-01')).toBe(false) // 第 7 天
    expect(matchesRate(onOff, '2026-10-02')).toBe(true) // 第 8 天
  })

  it('参数缺失 / 非法 → 判为该吃（R-08 失败方向：不隐藏）', () => {
    const broken = plan({
      rateMode: 'cyclic',
      rateOnDays: null,
      rateOffDays: 1,
      rateAnchorDate: '2026-09-25',
    })
    expect(matchesRate(broken, '2026-09-20')).toBe(true)
    expect(isRateConfigValid(broken)).toBe(false)

    const badAnchor = plan({
      rateMode: 'cyclic',
      rateOnDays: 1,
      rateOffDays: 1,
      rateAnchorDate: '2026-9-25',
    })
    expect(matchesRate(badAnchor, '2026-09-20')).toBe(true)
    expect(isRateConfigValid(badAnchor)).toBe(false)
  })
})

describe('nextRateDate', () => {
  it('daily → 第二天', () => {
    expect(nextRateDate(plan(), '2026-09-20')).toBe('2026-09-21')
  })

  it('隔天：从休息日 9/26 找到 9/27', () => {
    expect(nextRateDate(everyOther, '2026-09-26')).toBe('2026-09-27')
  })

  it('吃 5 停 2：从第 6 天找到第 8 天', () => {
    expect(nextRateDate(onOff, '2026-09-30')).toBe('2026-10-02')
  })

  it('严格晚于 fromDate，不返回当天', () => {
    expect(nextRateDate(everyOther, '2026-09-25')).not.toBe('2026-09-25')
  })

  it('配置异常时按每天算', () => {
    const broken = plan({
      rateMode: 'cyclic',
      rateOnDays: null,
      rateOffDays: null,
      rateAnchorDate: null,
    })
    expect(nextRateDate(broken, '2026-09-20')).toBe('2026-09-21')
  })
})

describe('rateDensity', () => {
  it('daily 为 1', () => {
    expect(rateDensity(plan())).toBe(1)
  })

  it('吃 5 停 2 为 5/7', () => {
    expect(rateDensity(onOff)).toBeCloseTo(5 / 7)
  })

  it('隔天为 1/2', () => {
    expect(rateDensity(everyOther)).toBeCloseTo(0.5)
  })

  it('参数缺失时退化为 1', () => {
    const broken = plan({ rateMode: 'cyclic', rateOnDays: null, rateOffDays: null })
    expect(rateDensity(broken)).toBe(1)
  })
})

describe('describeRate', () => {
  it('daily → 每天', () => {
    expect(describeRate(plan())).toBe('每天')
  })

  it('吃 1 停 1 → 隔天（不是「每 2 天一次」）', () => {
    expect(describeRate(everyOther)).toBe('隔天')
  })

  it('吃 1 停 N → 每 N+1 天一次', () => {
    expect(describeRate(plan({ rateMode: 'cyclic', rateOnDays: 1, rateOffDays: 2 }))).toBe(
      '每 3 天一次',
    )
  })

  it('吃 N 停 M → 吃 N 停 M', () => {
    expect(describeRate(onOff)).toBe('吃 5 停 2')
  })

  it('参数缺失 → 配置异常', () => {
    expect(describeRate(plan({ rateMode: 'cyclic', rateOnDays: null, rateOffDays: null }))).toBe(
      '配置异常',
    )
  })
})

describe('isRateConfigValid', () => {
  it('daily 恒为合法', () => {
    expect(isRateConfigValid(plan())).toBe(true)
  })

  it('cyclic 参数齐全合法', () => {
    expect(isRateConfigValid(everyOther)).toBe(true)
    expect(isRateConfigValid(onOff)).toBe(true)
  })

  it('cyclic 缺任意一项即非法', () => {
    expect(isRateConfigValid(plan({ rateMode: 'cyclic', rateOnDays: 1, rateOffDays: 1 }))).toBe(
      false,
    )
    expect(
      isRateConfigValid(
        plan({ rateMode: 'cyclic', rateOnDays: 1, rateOffDays: 1, rateAnchorDate: 'x' }),
      ),
    ).toBe(false)
  })
})

/**
 * 吃 21 停 7（周期 28 天）—— 长期疗程最常见的一种。
 *
 * 与吃 5 停 2 走的是**同一段代码**，单独钉一组是因为周期长（28 天）会踩到两个量：
 * ①`nextRateDate` 的搜索上界必须 ≥ on+off，否则休息段会找不到下一次
 * ②`matchesRate` 的取模在跨月、跨多轮时不能漂
 */
describe('吃 21 停 7（周期 28 天）', () => {
  const on21off7 = plan({
    rateMode: 'cyclic',
    rateOnDays: 21,
    rateOffDays: 7,
    rateAnchorDate: '2026-09-01',
  })

  it('第 1–21 天该吃、第 22–28 天休息、第 29 天进入下一轮', () => {
    expect(matchesRate(on21off7, '2026-09-01')).toBe(true) // 第 1 天
    expect(matchesRate(on21off7, '2026-09-21')).toBe(true) // 第 21 天
    expect(matchesRate(on21off7, '2026-09-22')).toBe(false) // 第 22 天
    expect(matchesRate(on21off7, '2026-09-28')).toBe(false) // 第 28 天
    expect(matchesRate(on21off7, '2026-09-29')).toBe(true) // 第 29 天 = 第 2 轮第 1 天
  })

  it('跨月也不漂：第 2 轮的第 21 / 22 天仍准（10/19 该吃、10/20 休息）', () => {
    expect(matchesRate(on21off7, '2026-10-19')).toBe(true) // 第 49 天
    expect(matchesRate(on21off7, '2026-10-20')).toBe(false) // 第 50 天
  })

  it('休息段内任意一天，「下次」都指向下一轮的起点日（起点 + 28）', () => {
    expect(nextRateDate(on21off7, '2026-09-22')).toBe('2026-09-29')
    expect(nextRateDate(on21off7, '2026-09-28')).toBe('2026-09-29')
  })

  it('文案是「吃 21 停 7」（不是「每 8 天一次」）', () => {
    expect(describeRate(on21off7)).toBe('吃 21 停 7')
  })

  it('日均出现率 21/28 = 0.75 —— 余量偏低按此折算，不能按每天算', () => {
    expect(rateDensity(on21off7)).toBeCloseTo(0.75)
  })
})
