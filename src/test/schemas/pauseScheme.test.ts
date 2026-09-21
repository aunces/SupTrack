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
