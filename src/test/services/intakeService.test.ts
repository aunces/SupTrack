import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { NOT_DELETED } from '@/constants/deletedAt'
import { META_KEY } from '@/constants/enums'
import { supplementRepository } from '@/repositories'
import { metaService } from '@/services/metaService'
import { createIntake, updateIntake, validateIntakeDate } from '@/services/intakeService'
import { newId, nowIso } from '@/utils/id'
import { formatDate, today, yesterday } from '@/utils/date'
import { subDays, format } from 'date-fns'

async function supp() {
  return supplementRepository.create({
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
  })
}

function input(supplementId: string, overrides: Record<string, unknown> = {}) {
  const now = nowIso()
  return {
    id: newId(),
    date: today(),
    supplementId,
    planId: null,
    plannedAmount: null,
    plannedAmountSnapshot: null,
    plannedAmountSource: 'unavailable',
    actualAmount: 1,
    timeSlot: 'morning',
    status: 'taken',
    source: 'manual',
    notes: null,
    stockState: 'deducted',
    deletedAt: NOT_DELETED,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as never
}

describe('intakeService', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await metaService.initDefaults()
  })

  it('validateIntakeDate 三分支', async () => {
    await expect(validateIntakeDate(today(), 'today')).resolves.toBeUndefined()
    await expect(validateIntakeDate(yesterday(), 'today')).rejects.toThrow(/必须是今天/)

    await expect(validateIntakeDate(yesterday(), 'backfill')).resolves.toBeUndefined()
    await expect(validateIntakeDate(today(), 'backfill')).rejects.toThrow(/不能是今天或未来/)
    await expect(
      validateIntakeDate(format(subDays(new Date(), 31), 'yyyy-MM-dd'), 'backfill'),
    ).rejects.toThrow(/不能早于/)

    await expect(validateIntakeDate('2020-01-01', 'update')).resolves.toBeUndefined()
  })

  it('补录范围读取 Meta.backfillWindowDays 且运行时生效', async () => {
    await metaService.set(META_KEY.BACKFILL_WINDOW_DAYS, 3)
    const target = format(subDays(new Date(), 5), 'yyyy-MM-dd')
    await expect(validateIntakeDate(target, 'backfill')).rejects.toThrow(/不能早于/)

    await metaService.set(META_KEY.BACKFILL_WINDOW_DAYS, 10)
    await expect(validateIntakeDate(target, 'backfill')).resolves.toBeUndefined()
  })

  it('今日手动录入拒绝 skipped', async () => {
    const s = await supp()
    await expect(
      createIntake(input(s.id, { status: 'skipped', date: today() }), 'today'),
    ).rejects.toThrow(/请明日通过补录功能标记/)
  })

  it('补录允许 skipped', async () => {
    const s = await supp()
    const record = await createIntake(
      input(s.id, { status: 'skipped', stockState: 'not_deducted', date: yesterday() }),
      'backfill',
    )
    expect(record.status).toBe('skipped')
  })

  it('同一 date + supplementId + timeSlot 重复创建被拒', async () => {
    const s = await supp()
    await createIntake(input(s.id), 'today')
    await expect(createIntake(input(s.id), 'today')).rejects.toThrow(/该时段已有记录/)
  })

  it('软删除记录禁止历史修正', async () => {
    const s = await supp()
    const record = await createIntake(input(s.id), 'today')
    await db.dailyIntakes.update(record.id, { deletedAt: nowIso(), stockState: 'was_deducted' })

    await expect(updateIntake(record.id, { notes: 'x' }, 'update')).rejects.toThrow(/请先恢复/)
  })

  it('部分更新只改 notes 不触发库存变化', async () => {
    const s = await supp()
    const record = await createIntake(input(s.id), 'today')
    const stockBefore = (await db.supplements.get(s.id))?.stockCountInUsageUnit

    const updated = await updateIntake(record.id, { notes: '饭后吃' }, 'update')
    expect(updated.notes).toBe('饭后吃')
    expect((await db.supplements.get(s.id))?.stockCountInUsageUnit).toBe(stockBefore)
  })

  it('补录记录按 date 归属，可标注补录', async () => {
    const s = await supp()
    const date = yesterday()
    const record = await createIntake(input(s.id, { date }), 'backfill')
    expect(record.date).toBe(date)
    expect(formatDate(new Date(record.createdAt))).toBe(today())
  })
})
