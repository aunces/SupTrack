import { describe, expect, it } from 'vitest'
import type { PausePeriod, PauseScheme } from '@/types'
import {
  coversDate,
  findActivePauses,
  isPausedOn,
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
