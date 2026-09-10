import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { NOT_DELETED } from '@/constants/deletedAt'
import { META_KEY } from '@/constants/enums'
import { metaService } from '@/services/metaService'
import { detectIssues, exportData, importData } from '@/services/importService'
import { mergeRecord } from '@/utils/merge'
import { newId, nowIso } from '@/utils/id'

async function seedSupplement(name: string, overrides: Record<string, unknown> = {}) {
  const id = newId()
  await db.supplements.add({
    id,
    name,
    brand: null,
    description: null,
    unitType: 'capsule',
    stockCountInUsageUnit: 10,
    stockUnit: null,
    unitsPerStock: null,
    productionDate: null,
    expiryDate: null,
    status: 'active',
    deletedAt: NOT_DELETED,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  })
  return id
}

describe('导入 / 导出', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await metaService.initDefaults()
  })

  it('导出包含已软删除记录', async () => {
    await seedSupplement('在用')
    await seedSupplement('已删除', { deletedAt: '2026-02-01T00:00:00.000Z' })
    const payload = await exportData()
    expect(payload.data.supplements).toHaveLength(2)
  })

  it('合并策略：新增 / 较新覆盖 / 较旧保留', async () => {
    const id = await seedSupplement('原名')
    const payload = {
      meta: { schemaVersion: 10 },
      data: {
        supplements: [
          {
            id,
            name: '较新名字',
            unitType: 'capsule',
            status: 'active',
            deletedAt: NOT_DELETED,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
          },
          {
            id: 'older-record',
            name: '旧记录',
            unitType: 'capsule',
            status: 'active',
            deletedAt: NOT_DELETED,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      },
      exportedAt: nowIso(),
    }

    const summary = await importData(payload, 'merge', { skipBackup: true })
    expect(summary.added).toBe(1)
    expect(summary.updated).toBe(1)
    expect((await db.supplements.get(id))?.name).toBe('较新名字')
  })

  it('覆盖策略清空后导入', async () => {
    await seedSupplement('本地数据')
    const payload = {
      meta: { schemaVersion: 10 },
      data: { supplements: [] },
      exportedAt: nowIso(),
    }
    await importData(payload, 'overwrite', { skipBackup: true })
    expect(await db.supplements.count()).toBe(0)
  })

  it('异常清单：A / B / C 被识别并跳过导入', async () => {
    const issues = detectIssues([
      { id: 'a', deletedAt: '2026-01-01T00:00:00.000Z', stockState: 'deducted' },
      { id: 'b', deletedAt: 0, stockState: 'unknown' },
      { id: 'c', deletedAt: 0, stockState: 'deducted', status: 'skipped' },
      { id: 'd', deletedAt: '2026-01-01T00:00:00.000Z', stockState: 'unknown' },
    ])
    expect(issues.map((i) => i.type)).toEqual(['A', 'B', 'C'])

    const summary = await importData(
      {
        meta: { schemaVersion: 10 },
        data: {
          dailyIntakes: [
            { id: 'a', deletedAt: '2026-01-01T00:00:00.000Z', stockState: 'deducted' },
            {
              id: 'ok',
              date: '2026-09-01',
              supplementId: 's1',
              timeSlot: 'morning',
              status: 'taken',
              source: 'manual',
              actualAmount: 1,
              deletedAt: NOT_DELETED,
              stockState: 'deducted',
              createdAt: nowIso(),
              updatedAt: nowIso(),
            },
          ],
        },
        exportedAt: nowIso(),
      },
      'overwrite',
      { skipBackup: true },
    )
    expect(summary.skipped).toBe(1)
    expect(await db.dailyIntakes.count()).toBe(1)
  })

  it('Meta 不合并：保留本地 backfillWindowDays', async () => {
    await metaService.set(META_KEY.BACKFILL_WINDOW_DAYS, 15)
    await importData(
      {
        meta: { schemaVersion: 9, backfillWindowDays: 3 },
        data: {},
        exportedAt: nowIso(),
      },
      'merge',
      { skipBackup: true },
    )
    expect(await metaService.getBackfillWindowDays()).toBe(15)
  })

  it('导入 v9 格式：软删除态 deducted 转 was_deducted', async () => {
    await importData(
      {
        meta: { schemaVersion: 9 },
        data: {
          dailyIntakes: [
            {
              id: newId(),
              date: '2026-08-01',
              supplementId: 's1',
              timeSlot: 'morning',
              status: 'taken',
              source: 'plan',
              actualAmount: 1,
              plannedAmount: 2,
              deletedAt: '2026-08-02T00:00:00.000Z',
              stockState: 'deducted',
              createdAt: nowIso(),
              updatedAt: nowIso(),
            },
          ],
        },
        exportedAt: nowIso(),
      },
      'overwrite',
      { skipBackup: true },
    )
    const row = (await db.dailyIntakes.toArray())[0]
    expect(row.stockState).toBe('was_deducted')
    expect(row.plannedAmountSnapshot).toBe(2)
    expect(row.plannedAmountSource).toBe('plan_snapshot')
  })
})

describe('mergeRecord', () => {
  interface Row {
    id: string
    updatedAt: string
    deletedAt: number | string
  }

  it('DailyIntake 时间相同时取 local', () => {
    const local: Row = { id: '1', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: NOT_DELETED }
    const incoming: Row = {
      id: '1',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: '2026-02-01T00:00:00.000Z',
    }
    expect(mergeRecord(local, incoming, 'dailyIntakes')).toBe(local)
  })

  it('其他表时间相同时删除意图优先', () => {
    const local: Row = { id: '1', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: NOT_DELETED }
    const incoming: Row = {
      id: '1',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: '2026-02-01T00:00:00.000Z',
    }
    expect(mergeRecord(local, incoming, 'supplements')).toBe(incoming)
  })

  it('时间不同取较新者', () => {
    const local: Row = { id: '1', updatedAt: '2026-03-01T00:00:00.000Z', deletedAt: NOT_DELETED }
    const incoming: Row = {
      id: '1',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: NOT_DELETED,
    }
    expect(mergeRecord(local, incoming, 'supplements')).toBe(local)
  })
})
