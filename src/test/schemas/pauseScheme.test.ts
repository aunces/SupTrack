import { describe, expect, it } from 'vitest'
import { PauseSchemeCreateSchema } from '@/schemas/pauseScheme'

const now = new Date().toISOString()

const base = {
  id: crypto.randomUUID(),
  name: '抗生素期间',
  note: null,
  isActive: true,
  activatedAt: '2026-09-18',
  endedAt: null,
  createdAt: now,
  updatedAt: now,
}

describe('PauseSchemeCreateSchema', () => {
  it('执行中（未设结束日）合法', () => {
    expect(PauseSchemeCreateSchema.safeParse(base).success).toBe(true)
  })

  it('已停止（有结束日）合法', () => {
    expect(
      PauseSchemeCreateSchema.safeParse({ ...base, isActive: false, endedAt: '2026-09-25' })
        .success,
    ).toBe(true)
  })

  it('名称为空被拒', () => {
    expect(PauseSchemeCreateSchema.safeParse({ ...base, name: '' }).success).toBe(false)
  })

  it('结束日早于执行日被拒', () => {
    const result = PauseSchemeCreateSchema.safeParse({ ...base, endedAt: '2026-09-17' })
    expect(result.success).toBe(false)
    expect(result.success === false && JSON.stringify(result.error.issues)).toContain(
      '结束日期不能早于执行日期',
    )
  })
})

/**
 * 周期字段（D-44）。
 *
 * 三个字段都带 `.default()`，所以**旧备份（没有这几个字段）能原样导入**，
 * 落回「连续」语义 —— 这是不需要写迁移脚本的前提。
 */
describe('PauseSchemeCreateSchema · 周期字段（D-44）', () => {
  it('完全不传周期字段 → 落回「连续」（旧备份 / 老调用方都不必改）', () => {
    const result = PauseSchemeCreateSchema.safeParse(base)
    if (!result.success) throw new Error('应当通过')
    expect(result.data.cycleMode).toBe('continuous')
    expect(result.data.cycleOnDays).toBeNull()
    expect(result.data.cycleOffDays).toBeNull()
  })

  it('周期 + 吃/停都给 → 合法', () => {
    const result = PauseSchemeCreateSchema.safeParse({
      ...base,
      cycleMode: 'cyclic',
      cycleOnDays: 21,
      cycleOffDays: 7,
    })
    if (!result.success) throw new Error('应当通过')
    expect(result.data.cycleOnDays).toBe(21)
    expect(result.data.cycleOffDays).toBe(7)
  })

  it('周期但缺「吃几天 / 停几天」或非正数 → 被拒', () => {
    const invalid = [
      { cycleMode: 'cyclic' },
      { cycleMode: 'cyclic', cycleOnDays: 21 },
      { cycleMode: 'cyclic', cycleOnDays: 21, cycleOffDays: null },
      { cycleMode: 'cyclic', cycleOnDays: 0, cycleOffDays: 7 },
      { cycleMode: 'cyclic', cycleOnDays: 21, cycleOffDays: 0 },
      { cycleMode: 'cyclic', cycleOnDays: 21.5, cycleOffDays: 7 },
    ]
    for (const patch of invalid) {
      expect(PauseSchemeCreateSchema.safeParse({ ...base, ...patch }).success).toBe(false)
    }

    const result = PauseSchemeCreateSchema.safeParse({ ...base, cycleMode: 'cyclic' })
    expect(result.success === false && result.error.issues[0]?.message).toBe(
      '周期方案必须填写「吃几天 / 停几天」',
    )
  })

  it('连续模式带着吃/停参数也不报错（宽容：值存下来但不参与判定）', () => {
    const result = PauseSchemeCreateSchema.safeParse({
      ...base,
      cycleMode: 'continuous',
      cycleOnDays: 5,
      cycleOffDays: 2,
    })
    expect(result.success).toBe(true)
  })
})
