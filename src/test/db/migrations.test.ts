import { describe, expect, it } from 'vitest'
import {
  migratePayload,
  migrateV3toV4,
  migrateV4toV5,
  migrateV5toV6,
  migrateV8toV9,
  migrateV9toV10,
  type MigrationPayload,
} from '@/db/migrations'

function payload(dailyIntakes: Record<string, unknown>[]): MigrationPayload {
  return {
    meta: { schemaVersion: 3 },
    data: {
      supplements: [{ id: 's1', stockCountInUsageUnit: 60 }],
      dailyIntakes,
    },
  }
}

describe('迁移链', () => {
  it('v3 → v4：未删除记录回填 stockDeducted，已删除记录为 unknown', () => {
    const result = migrateV3toV4(
      payload([
        { id: 'i1', supplementId: 's1', deletedAt: null },
        { id: 'i2', supplementId: 's1', deletedAt: '2026-01-01T00:00:00.000Z' },
      ]),
    )
    expect(result.data.dailyIntakes[0].stockDeducted).toBe(true)
    expect(result.data.dailyIntakes[0].stockRollbackState).toBe('not_rolled_back')
    expect(result.data.dailyIntakes[1].stockDeducted).toBe(true)
    expect(result.data.dailyIntakes[1].stockRollbackState).toBe('unknown')
  })

  it('v4 → v5：deletedAt 由 null 转 0', () => {
    const result = migrateV4toV5(payload([{ id: 'i1', deletedAt: null }]))
    expect(result.data.dailyIntakes[0].deletedAt).toBe(0)
  })

  it('v5 → v6：stockRolledBack 转 stockRollbackState 并删除旧字段', () => {
    const result = migrateV5toV6(
      payload([
        { id: 'i1', supplementId: 's1', deletedAt: 0, stockRolledBack: true },
        { id: 'i2', supplementId: 's1', deletedAt: 0, stockRolledBack: false },
        { id: 'i3', supplementId: 's1', deletedAt: 0 },
      ]),
    )
    expect(result.data.dailyIntakes[0].stockRollbackState).toBe('rolled_back')
    expect(result.data.dailyIntakes[1].stockRollbackState).toBe('not_rolled_back')
    expect(result.data.dailyIntakes[2].stockRollbackState).toBe('unknown')
    expect(result.data.dailyIntakes[0].stockRolledBack).toBeUndefined()
  })

  it('v8 → v9：合并为 stockState 三态', () => {
    const result = migrateV8toV9(
      payload([
        { id: 'i1', stockDeducted: true, stockRollbackState: 'not_rolled_back' },
        { id: 'i2', stockDeducted: false, stockRollbackState: 'not_rolled_back' },
        { id: 'i3', stockDeducted: true, stockRollbackState: 'rolled_back' },
        { id: 'i4', stockDeducted: true, stockRollbackState: 'unknown' },
      ]),
    )
    expect(result.data.dailyIntakes.map((r) => r.stockState)).toEqual([
      'deducted',
      'not_deducted',
      'not_deducted',
      'unknown',
    ])
    expect(result.data.dailyIntakes[0].stockDeducted).toBeUndefined()
    expect(result.data.dailyIntakes[0].stockRollbackState).toBeUndefined()
  })

  it('v9 → v10：软删除态 deducted 转 was_deducted，并回填快照字段', () => {
    const result = migrateV9toV10(
      payload([
        { id: 'i1', deletedAt: 0, stockState: 'deducted', plannedAmount: 2 },
        { id: 'i2', deletedAt: '2026-01-01T00:00:00.000Z', stockState: 'deducted' },
        { id: 'i3', deletedAt: 0, stockState: 'not_deducted' },
      ]),
    )
    expect(result.data.dailyIntakes[0].stockState).toBe('deducted')
    expect(result.data.dailyIntakes[0].plannedAmountSnapshot).toBe(2)
    expect(result.data.dailyIntakes[0].plannedAmountSource).toBe('plan_snapshot')
    expect(result.data.dailyIntakes[1].stockState).toBe('was_deducted')
    expect(result.data.dailyIntakes[2].plannedAmountSource).toBe('unavailable')
  })

  it('从 v3 一次性迁移到 v10.1', () => {
    const { payload: result, version } = migratePayload(
      payload([
        { id: 'i1', supplementId: 's1', deletedAt: null },
        { id: 'i2', supplementId: 's1', deletedAt: '2026-01-01T00:00:00.000Z' },
      ]),
      3,
    )
    expect(version).toBe(10)
    expect(result.meta.schemaVersion).toBe(10)
    expect(result.meta.backfillWindowDays).toBe(30)
    expect(result.data.dailyIntakes[0].deletedAt).toBe(0)
    expect(result.data.dailyIntakes[0].stockState).toBe('deducted')
    expect(result.data.dailyIntakes[1].stockState).toBe('unknown')
  })

  it('迁移幂等：重复执行结果一致', () => {
    const first = migrateV9toV10(
      payload([{ id: 'i1', deletedAt: 0, stockState: 'deducted', plannedAmount: 1 }]),
    )
    const second = migrateV9toV10(first)
    expect(second.data.dailyIntakes).toEqual(first.data.dailyIntakes)
  })
})
