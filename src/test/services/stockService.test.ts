import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { NOT_DELETED } from '@/constants/deletedAt'
import { STOCK_STATE } from '@/constants/stockState'
import { supplementRepository, stockLogRepository } from '@/repositories'
import { applyTransition, applyTransitionBatch, applyTransitionInTx } from '@/services/stockService'
import type { DailyIntake, Supplement } from '@/types'
import { newId, nowIso } from '@/utils/id'

async function supp(overrides: Partial<Supplement> = {}): Promise<Supplement> {
  return supplementRepository.create({
    id: newId(),
    name: '鱼油',
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
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  })
}

function intake(supplementId: string, overrides: Partial<DailyIntake> = {}): DailyIntake {
  const now = nowIso()
  return {
    id: newId(),
    date: '2026-09-10',
    supplementId,
    planId: null,
    plannedAmount: null,
    plannedAmountSnapshot: null,
    plannedAmountSource: 'unavailable',
    actualAmount: 2,
    timeSlot: 'morning',
    status: 'taken',
    source: 'manual',
    notes: null,
    stockState: STOCK_STATE.DEDUCTED,
    deletedAt: NOT_DELETED,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

async function stockOf(id: string) {
  return (await db.supplements.get(id))?.stockCountInUsageUnit
}

async function logsOf(intakeId: string) {
  return stockLogRepository.listByIntake(intakeId)
}

describe('库存状态机', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('打卡扣减库存并写 intake 流水', async () => {
    const s = await supp()
    const record = intake(s.id, { source: 'plan' })
    await applyTransition({ type: 'create', intake: record, source: 'plan' })

    expect(await stockOf(s.id)).toBe(8)
    const logs = await logsOf(record.id)
    expect(logs).toHaveLength(1)
    expect(logs[0].reason).toBe('intake')
    expect(logs[0].deltaInUsageUnit).toBe(-2)
  })

  it('允许负库存', async () => {
    const s = await supp({ stockCountInUsageUnit: 1 })
    await applyTransition({ type: 'create', intake: intake(s.id), source: 'manual' })
    expect(await stockOf(s.id)).toBe(-1)
  })

  it('不记录库存的补剂：stockState = not_deducted，不写流水', async () => {
    const s = await supp({ stockCountInUsageUnit: null })
    const record = intake(s.id)
    await applyTransition({ type: 'create', intake: record, source: 'manual' })

    expect((await db.dailyIntakes.get(record.id))?.stockState).toBe(STOCK_STATE.NOT_DEDUCTED)
    expect(await logsOf(record.id)).toHaveLength(0)
  })

  it('skipped 不扣库存', async () => {
    const s = await supp()
    const record = intake(s.id, { status: 'skipped' })
    await applyTransition({ type: 'create', intake: record, source: 'manual' })

    expect(await stockOf(s.id)).toBe(10)
    expect((await db.dailyIntakes.get(record.id))?.stockState).toBe(STOCK_STATE.NOT_DEDUCTED)
  })

  it('软删除回滚库存，deducted → was_deducted', async () => {
    const s = await supp()
    const record = intake(s.id)
    await applyTransition({ type: 'create', intake: record, source: 'manual' })
    await applyTransition({ type: 'softDelete', intakeId: record.id })

    expect(await stockOf(s.id)).toBe(10)
    const stored = await db.dailyIntakes.get(record.id)
    expect(stored?.stockState).toBe(STOCK_STATE.WAS_DEDUCTED)
    expect(stored?.deletedAt).not.toBe(NOT_DELETED)
    expect((await logsOf(record.id)).some((l) => l.reason === 'undo_intake')).toBe(true)
  })

  it('软删除 not_deducted 记录：状态保持且不写流水', async () => {
    const s = await supp({ stockCountInUsageUnit: null })
    const record = intake(s.id)
    await applyTransition({ type: 'create', intake: record, source: 'manual' })
    await applyTransition({ type: 'softDelete', intakeId: record.id })

    expect((await db.dailyIntakes.get(record.id))?.stockState).toBe(STOCK_STATE.NOT_DEDUCTED)
    expect(await logsOf(record.id)).toHaveLength(0)
  })

  it('恢复 was_deducted 重扣库存', async () => {
    const s = await supp()
    const record = intake(s.id)
    await applyTransition({ type: 'create', intake: record, source: 'manual' })
    await applyTransition({ type: 'softDelete', intakeId: record.id })
    await applyTransition({ type: 'restore', intakeId: record.id })

    expect(await stockOf(s.id)).toBe(8)
    const stored = await db.dailyIntakes.get(record.id)
    expect(stored?.stockState).toBe(STOCK_STATE.DEDUCTED)
    expect(stored?.deletedAt).toBe(NOT_DELETED)
  })

  it('恢复 not_deducted 不重扣', async () => {
    const s = await supp({ stockCountInUsageUnit: null })
    const record = intake(s.id)
    await applyTransition({ type: 'create', intake: record, source: 'manual' })
    await applyTransition({ type: 'softDelete', intakeId: record.id })
    await applyTransition({ type: 'restore', intakeId: record.id })

    expect(await stockOf(s.id)).toBeNull()
    expect((await db.dailyIntakes.get(record.id))?.stockState).toBe(STOCK_STATE.NOT_DEDUCTED)
  })

  it('unknown 恢复必须用户二选一', async () => {
    const s = await supp()
    const record = intake(s.id, {
      status: 'taken',
      stockState: STOCK_STATE.UNKNOWN,
      deletedAt: '2026-01-01T00:00:00.000Z',
    })
    await db.dailyIntakes.add(record)

    await expect(applyTransition({ type: 'restore', intakeId: record.id })).rejects.toThrow(/未知/)

    await applyTransition({
      type: 'restore',
      intakeId: record.id,
      unknownChoice: 'not_deducted',
    })
    expect(await stockOf(s.id)).toBe(10)
    expect((await db.dailyIntakes.get(record.id))?.stockState).toBe(STOCK_STATE.NOT_DEDUCTED)
  })

  it('unknown 恢复选"视为已扣"时扣减并写 adjust 流水', async () => {
    const s = await supp()
    const record = intake(s.id, {
      status: 'taken',
      stockState: STOCK_STATE.UNKNOWN,
      deletedAt: '2026-01-01T00:00:00.000Z',
    })
    await db.dailyIntakes.add(record)

    await applyTransition({ type: 'restore', intakeId: record.id, unknownChoice: 'deducted' })
    expect(await stockOf(s.id)).toBe(8)
    const logs = await logsOf(record.id)
    expect(logs.some((l) => l.reason === 'adjust')).toBe(true)
  })

  it('purge 不触碰库存（直接物理删除）', async () => {
    const s = await supp()
    const record = intake(s.id)
    await applyTransition({ type: 'create', intake: record, source: 'manual' })
    await db.dailyIntakes.delete(record.id)

    expect(await stockOf(s.id)).toBe(8)
    // 流水保留，形成悬空引用
    expect(await logsOf(record.id)).toHaveLength(1)
  })

  it('幂等：重复软删除 / 重复恢复只生效一次', async () => {
    const s = await supp()
    const record = intake(s.id)
    await applyTransition({ type: 'create', intake: record, source: 'manual' })

    await applyTransition({ type: 'softDelete', intakeId: record.id })
    await applyTransition({ type: 'softDelete', intakeId: record.id })
    expect(await stockOf(s.id)).toBe(10)

    await applyTransition({ type: 'restore', intakeId: record.id })
    await applyTransition({ type: 'restore', intakeId: record.id })
    expect(await stockOf(s.id)).toBe(8)
  })

  it('历史修正：taken → skipped 回滚，skipped → taken 补扣', async () => {
    const s = await supp()
    const record = intake(s.id)
    await applyTransition({ type: 'create', intake: record, source: 'manual' })
    expect(await stockOf(s.id)).toBe(8)

    await applyTransition({
      type: 'updateStatus',
      intakeId: record.id,
      newStatus: 'skipped',
      newActualAmount: 2,
    })
    expect(await stockOf(s.id)).toBe(10)
    expect((await db.dailyIntakes.get(record.id))?.stockState).toBe(STOCK_STATE.NOT_DEDUCTED)

    await applyTransition({
      type: 'updateStatus',
      intakeId: record.id,
      newStatus: 'taken',
      newActualAmount: 2,
    })
    expect(await stockOf(s.id)).toBe(8)
    expect((await db.dailyIntakes.get(record.id))?.stockState).toBe(STOCK_STATE.DEDUCTED)
    expect(
      (await logsOf(record.id)).every((l) => l.reason === 'adjust' || l.reason === 'manual_intake'),
    ).toBe(true)
  })

  it('历史修正改量按 delta 调整', async () => {
    const s = await supp()
    const record = intake(s.id, { actualAmount: 2 })
    await applyTransition({ type: 'create', intake: record, source: 'manual' })

    await applyTransition({ type: 'updateAmount', intakeId: record.id, newActualAmount: 5 })
    expect(await stockOf(s.id)).toBe(5)
  })

  it('软删除记录禁止历史修正', async () => {
    const s = await supp()
    const record = intake(s.id)
    await applyTransition({ type: 'create', intake: record, source: 'manual' })
    await applyTransition({ type: 'softDelete', intakeId: record.id })

    await expect(
      applyTransition({
        type: 'updateStatus',
        intakeId: record.id,
        newStatus: 'taken',
        newActualAmount: 2,
      }),
    ).rejects.toThrow(/请先恢复/)
    await expect(
      applyTransition({ type: 'updateAmount', intakeId: record.id, newActualAmount: 3 }),
    ).rejects.toThrow(/请先恢复/)
  })

  it('批量操作在同一事务内完成，每条记录独立流水', async () => {
    const s1 = await supp({ name: 'A' })
    const s2 = await supp({ name: 'B' })
    const r1 = intake(s1.id)
    const r2 = intake(s2.id)

    await applyTransitionBatch([
      { type: 'create', intake: r1, source: 'manual' },
      { type: 'create', intake: r2, source: 'manual' },
    ])

    expect(await stockOf(s1.id)).toBe(8)
    expect(await stockOf(s2.id)).toBe(8)
    expect(await logsOf(r1.id)).toHaveLength(1)
    expect(await logsOf(r2.id)).toHaveLength(1)
  })

  it('applyTransitionInTx 与 applyTransition 行为一致', async () => {
    const s = await supp()
    const record = intake(s.id)

    await db.transaction('rw', db.dailyIntakes, db.supplements, db.stockLogs, async (tx) => {
      await applyTransitionInTx(tx, { type: 'create', intake: record, source: 'manual' })
    })
    expect(await stockOf(s.id)).toBe(8)

    const other = intake(s.id, { timeSlot: 'evening' })
    await applyTransition({ type: 'create', intake: other, source: 'manual' })
    expect(await stockOf(s.id)).toBe(6)
  })
})
