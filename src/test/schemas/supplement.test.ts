import { describe, expect, it } from 'vitest'
import { SupplementCreateSchema, SupplementUpdateSchema } from '@/schemas/supplement'

const now = new Date().toISOString()

const base = {
  id: crypto.randomUUID(),
  name: '鱼油',
  unitType: 'capsule',
  stockCount: 90,
  stockUnit: null,
  unitsPerStock: null,
  expiryDate: null,
  notes: null,
  createdAt: now,
  updatedAt: now,
}

describe('SupplementCreateSchema', () => {
  it('最小合法对象通过', () => {
    expect(SupplementCreateSchema.safeParse(base).success).toBe(true)
  })

  it('余量留空（null）合法', () => {
    expect(SupplementCreateSchema.safeParse({ ...base, stockCount: null }).success).toBe(true)
  })

  it('余量允许为负且必须是整数', () => {
    expect(SupplementCreateSchema.safeParse({ ...base, stockCount: -3 }).success).toBe(true)
    expect(SupplementCreateSchema.safeParse({ ...base, stockCount: 1.5 }).success).toBe(false)
  })

  it('名称为空被拒', () => {
    expect(SupplementCreateSchema.safeParse({ ...base, name: '' }).success).toBe(false)
  })

  it('非法单位被拒', () => {
    expect(SupplementCreateSchema.safeParse({ ...base, unitType: 'bottle' }).success).toBe(false)
  })

  it('过期日不是 yyyy-MM-dd 被拒', () => {
    expect(SupplementCreateSchema.safeParse({ ...base, expiryDate: '2026/09/20' }).success).toBe(
      false,
    )
    expect(SupplementCreateSchema.safeParse({ ...base, expiryDate: '2026-09-20' }).success).toBe(
      true,
    )
  })

  it('旧字段 status / deletedAt 已不在模型内（多余字段被忽略，但缺失必填字段会被拒）', () => {
    const { name, ...withoutName } = base
    void name
    expect(SupplementCreateSchema.safeParse(withoutName).success).toBe(false)
  })
})

describe('SupplementUpdateSchema', () => {
  it('部分更新只给余量即可', () => {
    expect(SupplementUpdateSchema.safeParse({ stockCount: 12 }).success).toBe(true)
    expect(SupplementUpdateSchema.safeParse({ stockCount: null }).success).toBe(true)
  })

  it('余量给非整数被拒', () => {
    expect(SupplementUpdateSchema.safeParse({ stockCount: 2.5 }).success).toBe(false)
  })
})
