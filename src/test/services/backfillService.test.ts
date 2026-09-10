import { subDays, format } from 'date-fns'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { NOT_DELETED } from '@/constants/deletedAt'
import { dosagePlanRepository, pausePeriodRepository, stockLogRepository } from '@/repositories'
import { backfillBatch, detectMissedPlans, getActivePlansForDate } from '@/services/backfillService'
import { newId, nowIso } from '@/utils/id'
import { formatDate, today, yesterday } from '@/utils/date'
import { getMissedCache, invalidateMissedCache, setMissedCache } from '@/utils/missedCache'
import type { Supplement } from '@/types'

function dayAgo(days: number): string {
  return format(subDays(new Date(), days), 'yyyy-MM-dd')
}

async function supp(overrides: Partial<Supplement> = {}) {
  const record: Supplement = {
    id: newId(),
    name: '鱼油',
    brand: null,
    description: null,
    unitType: 'capsule',
    stockCountInUsageUnit: 30,
    stockUnit: null,
    unitsPerStock: null,
    productionDate: null,
    expiryDate: null,
    status: 'active',
    deletedAt: NOT_DELETED,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  }
  await db.supplements.add(record)
  return record
}

async function plan(supplementId: string, overrides: Record<string, unknown> = {}) {
  return dosagePlanRepository.create({
    id: newId(),
    supplementId,
    dailyAmount: 2,
    timeSlots: ['morning'],
    withMeal: true,
    isActive: true,
    notes: null,
    deletedAt: NOT_DELETED,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    ...overrides,
  } as never)
}

describe('补录', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('已服用：写入 taken、扣库存、计划量取当前计划', async () => {
    const s = await supp()
    const p = await plan(s.id)

    const result = await backfillBatch(
      [{ supplementId: s.id, timeSlot: 'morning', choice: 'taken' }],
      yesterday(),
    )

    expect(result.created).toBe(1)
    const records = await db.dailyIntakes.toArray()
    expect(records[0].status).toBe('taken')
    expect(records[0].source).toBe('manual')
    expect(records[0].plannedAmountSnapshot).toBe(2)
    expect(records[0].plannedAmountSource).toBe('current_plan')
    expect(records[0].planId).toBe(p.id)
    expect((await db.supplements.get(s.id))?.stockCountInUsageUnit).toBe(28)
    expect((await stockLogRepository.listByIntake(records[0].id))[0].reason).toBe('manual_intake')
  })

  it('无计划：status = extra，计划量 unavailable', async () => {
    const s = await supp()
    await backfillBatch([{ supplementId: s.id, timeSlot: 'morning', choice: 'taken' }], yesterday())
    const record = (await db.dailyIntakes.toArray())[0]
    expect(record.status).toBe('extra')
    expect(record.plannedAmountSource).toBe('unavailable')
    expect(record.actualAmount).toBe(1)
  })

  it('漏服：skipped 且不扣库存', async () => {
    const s = await supp()
    await plan(s.id)
    await backfillBatch(
      [{ supplementId: s.id, timeSlot: 'morning', choice: 'skipped' }],
      yesterday(),
    )
    const record = (await db.dailyIntakes.toArray())[0]
    expect(record.status).toBe('skipped')
    expect(record.stockState).toBe('not_deducted')
    expect((await db.supplements.get(s.id))?.stockCountInUsageUnit).toBe(30)
  })

  it('跳过已有记录', async () => {
    const s = await supp()
    await plan(s.id)
    const first = await backfillBatch(
      [{ supplementId: s.id, timeSlot: 'morning', choice: 'taken' }],
      yesterday(),
    )
    const second = await backfillBatch(
      [{ supplementId: s.id, timeSlot: 'morning', choice: 'taken' }],
      yesterday(),
    )
    expect(first.created).toBe(1)
    expect(second.created).toBe(0)
    expect(second.skippedExisting).toHaveLength(1)
  })

  it('跳过临期补剂', async () => {
    const s = await supp({ expiryDate: formatDate(new Date()) })
    await plan(s.id)
    const result = await backfillBatch(
      [{ supplementId: s.id, timeSlot: 'morning', choice: 'taken' }],
      yesterday(),
    )
    expect(result.created).toBe(0)
    expect(result.skippedExpiring[0].supplementId).toBe(s.id)
  })

  it('日期范围校验：今天 / 未来 / 超范围均拒绝', async () => {
    const s = await supp()
    await expect(
      backfillBatch([{ supplementId: s.id, timeSlot: 'morning', choice: 'taken' }], today()),
    ).rejects.toThrow(/不能是今天或未来/)
    await expect(
      backfillBatch([{ supplementId: s.id, timeSlot: 'morning', choice: 'taken' }], dayAgo(45)),
    ).rejects.toThrow(/不能早于/)
  })

  it('允许负库存并记入结果', async () => {
    const s = await supp({ stockCountInUsageUnit: 1 })
    await plan(s.id)
    const result = await backfillBatch(
      [{ supplementId: s.id, timeSlot: 'morning', choice: 'taken', actualAmount: 5 }],
      yesterday(),
    )
    expect(result.created).toBe(1)
    expect(result.negativeStock[0].stock).toBe(-4)
  })

  it('getActivePlansForDate 支持历史真实性过滤', async () => {
    const s = await supp()
    await plan(s.id, { createdAt: '2020-01-01T00:00:00.000Z' })
    const later = await plan(s.id, {
      timeSlots: ['evening'],
      createdAt: new Date().toISOString(),
    })

    const all = await getActivePlansForDate(dayAgo(3))
    expect(all).toHaveLength(2)
    const filtered = await getActivePlansForDate(dayAgo(3), { onlyExistingAtDate: true })
    expect(filtered.map((p) => p.id)).not.toContain(later.id)
  })
})

describe('次日提醒', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    invalidateMissedCache()
  })

  it('识别过去 7 天计划内未记录项（排除今天）', async () => {
    const s = await supp()
    await plan(s.id)

    const missed = await detectMissedPlans()
    expect(missed.length).toBe(7)
    expect(missed.every((m) => m.date !== today())).toBe(true)
    expect(missed[0].supplementId).toBe(s.id)
  })

  it('已有记录不再提醒（含 skipped）', async () => {
    const s = await supp()
    await plan(s.id)
    await db.dailyIntakes.add({
      id: newId(),
      date: yesterday(),
      supplementId: s.id,
      planId: null,
      plannedAmount: null,
      plannedAmountSnapshot: null,
      plannedAmountSource: 'unavailable',
      actualAmount: 2,
      timeSlot: 'morning',
      status: 'skipped',
      source: 'manual',
      notes: null,
      stockState: 'not_deducted',
      deletedAt: NOT_DELETED,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })

    const missed = await detectMissedPlans()
    expect(missed.some((m) => m.date === yesterday())).toBe(false)
    expect(missed).toHaveLength(6)
  })

  it('软删除的记录视为未记录', async () => {
    const s = await supp()
    await plan(s.id)
    await db.dailyIntakes.add({
      id: newId(),
      date: yesterday(),
      supplementId: s.id,
      planId: null,
      plannedAmount: null,
      plannedAmountSnapshot: null,
      plannedAmountSource: 'unavailable',
      actualAmount: 2,
      timeSlot: 'morning',
      status: 'taken',
      source: 'manual',
      notes: null,
      stockState: 'was_deducted',
      deletedAt: nowIso(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })

    const missed = await detectMissedPlans()
    expect(missed.some((m) => m.date === yesterday())).toBe(true)
  })

  it('排除停药日', async () => {
    const s = await supp()
    await plan(s.id)
    await pausePeriodRepository.create({
      id: newId(),
      supplementId: null,
      startDate: dayAgo(10),
      endDate: null,
      reason: null,
      cycleMode: 'none',
      cycleStartDate: null,
      cycleOnDays: null,
      cycleOffDays: null,
      deletedAt: NOT_DELETED,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    } as never)

    expect(await detectMissedPlans()).toHaveLength(0)
  })

  it('计划创建于日期之后不算应服项', async () => {
    const s = await supp()
    await plan(s.id, { createdAt: new Date().toISOString() })
    expect(await detectMissedPlans()).toHaveLength(0)
  })

  it('缓存 5 分钟内有效，invalidate 后失效', () => {
    expect(getMissedCache()).toBeNull()
    setMissedCache([])
    expect(getMissedCache()).toEqual([])
    invalidateMissedCache()
    expect(getMissedCache()).toBeNull()
  })
})
