import { describe, expect, it } from 'vitest'
import type { PausePeriod, PauseScheme } from '@/types'
import {
  coversDate,
  cyclicProgress,
  describeSchemeCycle,
  findActivePauses,
  isCyclicScheme,
  isCyclicSchemeOffDay,
  isPausedOn,
  nextCyclicOffDay,
  nextCyclicOnDay,
  resolveEffectiveRange,
  type PauseContext,
} from '@/utils/pause'

function period(overrides: Partial<PausePeriod> = {}): PausePeriod {
  return {
    id: 'period-1',
    schemeId: null,
    supplementId: 'supp-1',
    startDate: '2026-09-19',
    endDate: '2026-09-21',
    reason: null,
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
    ...overrides,
  }
}

function scheme(overrides: Partial<PauseScheme> = {}): PauseScheme {
  return {
    id: 'scheme-1',
    name: '抗生素期间',
    note: null,
    isActive: true,
    activatedAt: '2026-09-18',
    endedAt: null,
    // 默认连续；周期用例显式覆盖这三个（D-44）
    cycleMode: 'continuous',
    cycleOnDays: null,
    cycleOffDays: null,
    createdAt: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-18T00:00:00.000Z',
    ...overrides,
  }
}

function ctx(periods: PausePeriod[], schemes: PauseScheme[] = []): PauseContext {
  return { periods, schemes: new Map(schemes.map((s) => [s.id, s])) }
}

describe('coversDate', () => {
  it('闭区间：两端都算停用', () => {
    const range = { startDate: '2026-09-19', endDate: '2026-09-21' }
    expect(coversDate(range, '2026-09-18')).toBe(false)
    expect(coversDate(range, '2026-09-19')).toBe(true)
    expect(coversDate(range, '2026-09-21')).toBe(true)
    expect(coversDate(range, '2026-09-22')).toBe(false)
  })

  it('endDate 为空表示持续中', () => {
    expect(coversDate({ startDate: '2026-09-19', endDate: null }, '2030-01-01')).toBe(true)
  })
})

describe('resolveEffectiveRange · 生效区间规则表', () => {
  it('条目自带起止 → 用自己的区间', () => {
    expect(resolveEffectiveRange(period(), null)).toEqual({
      startDate: '2026-09-19',
      endDate: '2026-09-21',
    })
  })

  it('条目有开始无结束 → 持续到未来', () => {
    expect(resolveEffectiveRange(period({ endDate: null }), null)).toEqual({
      startDate: '2026-09-19',
      endDate: null,
    })
  })

  it('条目无起止 + 方案组已执行 → 区间跟随方案组', () => {
    const p = period({ schemeId: 'scheme-1', startDate: null, endDate: null })
    expect(resolveEffectiveRange(p, scheme())).toEqual({
      startDate: '2026-09-18',
      endDate: null,
    })
  })

  it('条目无起止 + 方案组从未执行 → 不生效', () => {
    const p = period({ schemeId: 'scheme-1', startDate: null, endDate: null })
    expect(resolveEffectiveRange(p, scheme({ activatedAt: null }))).toBeNull()
  })

  it('条目自带 endDate 优先于方案组 endedAt', () => {
    const p = period({ schemeId: 'scheme-1', startDate: null, endDate: '2026-09-20' })
    expect(resolveEffectiveRange(p, scheme({ endedAt: '2026-09-25' }))).toEqual({
      startDate: '2026-09-18',
      endDate: '2026-09-20',
    })
  })

  it('schemeId 指向的 scheme 不存在 → 按不生效处理，不抛错', () => {
    const p = period({ schemeId: 'missing', startDate: null })
    expect(() => resolveEffectiveRange(p, null)).not.toThrow()
    expect(resolveEffectiveRange(p, null)).toBeNull()
  })
})

describe('findActivePauses', () => {
  it("'ALL' 条目对任意补剂均命中", () => {
    const result = findActivePauses(
      'anything',
      '2026-09-20',
      ctx([period({ supplementId: 'ALL' })]),
    )
    expect(result).toHaveLength(1)
  })

  it('临时停药覆盖首尾，次日不命中', () => {
    const c = ctx([period({ startDate: '2026-09-19', endDate: '2026-09-21' })])
    expect(isPausedOn('supp-1', '2026-09-19', c)).toBe(true)
    expect(isPausedOn('supp-1', '2026-09-21', c)).toBe(true)
    expect(isPausedOn('supp-1', '2026-09-22', c)).toBe(false)
  })

  it('恢复日 = 结束日的次日（DIFF-05）', () => {
    const result = findActivePauses('supp-1', '2026-09-20', ctx([period()]))
    expect(result[0].resumeDate).toBe('2026-09-22')
  })

  it('无结束日 → endDate 与 resumeDate 均为 null（持续中）', () => {
    const result = findActivePauses('supp-1', '2026-09-20', ctx([period({ endDate: null })]))
    expect(result[0].endDate).toBeNull()
    expect(result[0].resumeDate).toBeNull()
  })

  it('补剂独立停药与方案组停药同时命中 → 两条都返回（并集）', () => {
    const periods = [
      period({ id: 'a' }),
      period({ id: 'b', schemeId: 'scheme-1', startDate: null, endDate: null }),
    ]
    const result = findActivePauses('supp-1', '2026-09-20', ctx(periods, [scheme()]))
    expect(result.map((r) => r.period.id).sort()).toEqual(['a', 'b'])
  })

  it('reasonLabel 优先取条目原因，其次方案组名，最后「停药中」', () => {
    const withReason = findActivePauses(
      'supp-1',
      '2026-09-20',
      ctx([period({ reason: '胃不舒服' })]),
    )
    expect(withReason[0].reasonLabel).toBe('胃不舒服')

    const fromScheme = findActivePauses(
      'supp-1',
      '2026-09-20',
      ctx([period({ schemeId: 'scheme-1', startDate: null, endDate: null })], [scheme()]),
    )
    expect(fromScheme[0].reasonLabel).toBe('抗生素期间')

    const fallback = findActivePauses('supp-1', '2026-09-20', ctx([period()]))
    expect(fallback[0].reasonLabel).toBe('停药中')
  })

  it('其它补剂的停药条目不影响本补剂', () => {
    expect(isPausedOn('supp-1', '2026-09-20', ctx([period({ supplementId: 'supp-2' })]))).toBe(
      false,
    )
  })

  it('方案组条目在组停止后落到 endedAt 为止', () => {
    const periods = [period({ schemeId: 'scheme-1', startDate: null, endDate: null })]
    const stopped = scheme({ isActive: false, endedAt: '2026-09-20' })
    expect(isPausedOn('supp-1', '2026-09-20', ctx(periods, [stopped]))).toBe(true)
    expect(isPausedOn('supp-1', '2026-09-21', ctx(periods, [stopped]))).toBe(false)
  })
})

/**
 * 周期停药（D-44）—— 用户 2026-09-22 裁决：方案组可以是「吃 N 停 M」。
 *
 * 这组用例守两条边界，缺一条都不算做完：
 *   ① 停用段要能产出「停用」（否则功能没生效）
 *   ② **吃段一个都不能产出「停用」**（否则就重现了 v11.1 的旧 bug：
 *      用户自己设的常规节奏被系统渲染成「停药中」，而那正是 v12 把周期
 *      从停药条目挪到计划的原因）
 */
describe('周期停药（D-44）', () => {
  /** 吃 21 停 7，执行日 9/1 → 9/1–9/21 吃、9/22–9/28 停、9/29 起下一轮 */
  function onOff217(): PauseScheme {
    return scheme({
      name: '21/7 疗程',
      activatedAt: '2026-09-01',
      cycleMode: 'cyclic',
      cycleOnDays: 21,
      cycleOffDays: 7,
    })
  }
  /** 跟随方案组的条目（startDate 为空） */
  function follows(overrides: Partial<PausePeriod> = {}): PausePeriod {
    return period({ schemeId: 'scheme-1', startDate: null, endDate: null, ...overrides })
  }

  it('isCyclicSchemeOffDay：第 1–21 天不是、第 22–28 天是、第 29 天进入下一轮', () => {
    const s = onOff217()
    expect(isCyclicSchemeOffDay(s, '2026-09-01')).toBe(false) // 第 1 天
    expect(isCyclicSchemeOffDay(s, '2026-09-21')).toBe(false) // 第 21 天
    expect(isCyclicSchemeOffDay(s, '2026-09-22')).toBe(true) // 第 22 天
    expect(isCyclicSchemeOffDay(s, '2026-09-28')).toBe(true) // 第 28 天
    expect(isCyclicSchemeOffDay(s, '2026-09-29')).toBe(false) // 第 29 天 = 第 2 轮第 1 天
  })

  it('连续方案 / 未执行 / 参数缺失或非法 → 都不是停用段（失败方向：不停用）', () => {
    expect(isCyclicSchemeOffDay(scheme(), '2026-09-25')).toBe(false)
    expect(
      isCyclicSchemeOffDay(
        scheme({ activatedAt: null, cycleMode: 'cyclic', cycleOnDays: 1, cycleOffDays: 1 }),
        '2026-09-25',
      ),
    ).toBe(false)
    expect(
      isCyclicSchemeOffDay(
        scheme({ cycleMode: 'cyclic', cycleOnDays: null, cycleOffDays: 7 }),
        '2026-09-25',
      ),
    ).toBe(false)
    expect(
      isCyclicSchemeOffDay(
        scheme({ cycleMode: 'cyclic', cycleOnDays: 0, cycleOffDays: 7 }),
        '2026-09-25',
      ),
    ).toBe(false)
  })

  it('执行日之前、endedAt 之后都不算停用段', () => {
    expect(isCyclicSchemeOffDay(onOff217(), '2026-08-31')).toBe(false)
    const stopped = { ...onOff217(), endedAt: '2026-09-25' }
    expect(isCyclicSchemeOffDay(stopped, '2026-09-26')).toBe(false)
  })

  it('停用段内命中停用，恢复日 = 下一个吃段首日（不是 endDate + 1）', () => {
    const result = findActivePauses('supp-1', '2026-09-22', ctx([follows()], [onOff217()]))
    expect(result).toHaveLength(1)
    expect(result[0].reasonLabel).toBe('21/7 疗程')
    expect(result[0].resumeDate).toBe('2026-09-29')
  })

  it('停用段内任意一天，恢复日都指向下一轮起点日', () => {
    const c = ctx([follows()], [onOff217()])
    expect(findActivePauses('supp-1', '2026-09-22', c)[0].resumeDate).toBe('2026-09-29')
    expect(findActivePauses('supp-1', '2026-09-28', c)[0].resumeDate).toBe('2026-09-29')
  })

  it('★ 吃段绝不产出停用（守门：不重现「常规节奏被当成停药」的旧 bug）', () => {
    const c = ctx([follows()], [onOff217()])
    expect(isPausedOn('supp-1', '2026-09-01', c)).toBe(false) // 第 1 天
    expect(isPausedOn('supp-1', '2026-09-21', c)).toBe(false) // 第 21 天
    expect(isPausedOn('supp-1', '2026-09-29', c)).toBe(false) // 第 2 轮第 1 天
    expect(isPausedOn('supp-1', '2026-10-19', c)).toBe(false) // 第 2 轮第 21 天
  })

  it('「独立起止」的条目不受周期影响（周期只作用于跟随方案的条目）', () => {
    const own = period({
      schemeId: 'scheme-1',
      startDate: '2026-09-22',
      endDate: '2026-09-24',
    })
    const c = ctx([own], [onOff217()])
    expect(isPausedOn('supp-1', '2026-09-22', c)).toBe(true) // 区间内
    expect(isPausedOn('supp-1', '2026-09-01', c)).toBe(false) // 区间外
  })

  it('「吃 5 停 2」同样支持（周期参数不写死）', () => {
    const s = scheme({
      activatedAt: '2026-09-01',
      cycleMode: 'cyclic',
      cycleOnDays: 5,
      cycleOffDays: 2,
    })
    const c = ctx([follows()], [s])
    expect(isPausedOn('supp-1', '2026-09-05', c)).toBe(false) // 第 5 天
    expect(isPausedOn('supp-1', '2026-09-06', c)).toBe(true) // 第 6 天
    expect(isPausedOn('supp-1', '2026-09-07', c)).toBe(true) // 第 7 天
    expect(isPausedOn('supp-1', '2026-09-08', c)).toBe(false) // 第 8 天
  })

  it('停止方案后周期立即失效', () => {
    const stopped = scheme({ ...onOff217(), isActive: false, endedAt: '2026-09-20' })
    expect(isPausedOn('supp-1', '2026-09-22', ctx([follows()], [stopped]))).toBe(false)
  })

  it('describeSchemeCycle 与节奏用同一套说法', () => {
    expect(describeSchemeCycle(onOff217())).toBe('吃 21 停 7')
    expect(
      describeSchemeCycle(scheme({ cycleMode: 'cyclic', cycleOnDays: 1, cycleOffDays: 1 })),
    ).toBe('隔天')
    expect(
      describeSchemeCycle(scheme({ cycleMode: 'cyclic', cycleOnDays: 1, cycleOffDays: 2 })),
    ).toBe('每 3 天一次')
    expect(describeSchemeCycle(scheme())).toBeNull()
  })

  it('★ 未执行的周期方案仍算「周期」（实测踩过：这里曾与「已执行」混成一个条件，行内误显示「连续」）', () => {
    const notActivated = scheme({
      activatedAt: null,
      cycleMode: 'cyclic',
      cycleOnDays: 21,
      cycleOffDays: 7,
    })
    // 「配了周期参数」与「能算具体某天」是两件事
    expect(isCyclicScheme(notActivated)).toBe(true)
    expect(describeSchemeCycle(notActivated)).toBe('吃 21 停 7')
    // 但没有起点就算不出停用段 / 第几天
    expect(isCyclicSchemeOffDay(notActivated, '2026-09-22')).toBe(false)
    expect(cyclicProgress(notActivated, '2026-09-22')).toBeNull()
    expect(nextCyclicOffDay(notActivated, '2026-09-22')).toBeNull()
  })

  it('cyclicProgress 给出「第几天 / 共几天 / 是否停用段」', () => {
    const s = onOff217()
    expect(cyclicProgress(s, '2026-09-01')).toEqual({ day: 1, total: 28, offDay: false })
    expect(cyclicProgress(s, '2026-09-22')).toEqual({ day: 22, total: 28, offDay: true })
    expect(cyclicProgress(s, '2026-09-29')).toEqual({ day: 1, total: 28, offDay: false })
    expect(cyclicProgress(s, '2026-08-31')).toBeNull() // 执行日之前
    expect(cyclicProgress(scheme(), '2026-09-22')).toBeNull() // 非周期
  })

  it('nextCyclicOffDay / nextCyclicOnDay 分别指向下一段「停」与「吃」', () => {
    const s = onOff217()
    expect(nextCyclicOffDay(s, '2026-09-01')).toBe('2026-09-22')
    expect(nextCyclicOffDay(s, '2026-09-21')).toBe('2026-09-22')
    expect(nextCyclicOnDay(s, '2026-09-01')).toBe('2026-09-02')
    expect(nextCyclicOnDay(s, '2026-09-22')).toBe('2026-09-29')
  })
})
