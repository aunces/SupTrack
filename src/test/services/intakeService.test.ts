import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import {
  DuplicateIntakeError,
  appendIntake,
  createIntake,
  listByDate,
  undoIntake,
  updateIntake,
} from '@/services/intakeService'
import { getStock, resetDb, seedIntake, seedSupplement } from '../helpers/db'

const DATE = '2026-09-20'

beforeEach(async () => {
  await resetDb()
})

function checkIn(supplementId: string, overrides: Record<string, unknown> = {}) {
  return {
    date: DATE,
    supplementId,
    planId: null,
    timeSlot: 'morning' as const,
    amount: 1,
    origin: 'checkin' as const,
    ...overrides,
  }
}

describe('createIntake · 打卡', () => {
  it('打卡成功：记录入库、taken=true、origin=checkin、余量 -N', async () => {
    const supplement = await seedSupplement({ stockCount: 30 })

    const record = await createIntake(checkIn(supplement.id, { amount: 2 }))

    expect(record.taken).toBe(true)
    expect(record.origin).toBe('checkin')
    expect(record.isExtra).toBe(false)
    expect(await db.dailyIntakes.count()).toBe(1)
    expect(await getStock(supplement.id)).toBe(28)
  })

  it('重复打卡被拒：抛 DuplicateIntakeError，记录数与余量都不变', async () => {
    const supplement = await seedSupplement({ stockCount: 30 })
    await createIntake(checkIn(supplement.id, { amount: 2 }))

    await expect(createIntake(checkIn(supplement.id, { amount: 2 }))).rejects.toThrow(
      DuplicateIntakeError,
    )
    await expect(createIntake(checkIn(supplement.id, { amount: 2 }))).rejects.toMatchObject({
      name: 'DuplicateIntakeError',
    })
    expect(await db.dailyIntakes.count()).toBe(1)
    expect(await getStock(supplement.id)).toBe(28)
  })

  it('同一补剂不同时段不算重复', async () => {
    const supplement = await seedSupplement({ stockCount: 10 })
    await createIntake(checkIn(supplement.id, { timeSlot: 'morning' }))
    await createIntake(checkIn(supplement.id, { timeSlot: 'evening' }))
    expect(await db.dailyIntakes.count()).toBe(2)
    expect(await getStock(supplement.id)).toBe(8)
  })

  it('余量为 null 时打卡不抛错，余量保持 null', async () => {
    const supplement = await seedSupplement({ stockCount: null })
    await createIntake(checkIn(supplement.id, { amount: 3 }))
    expect(await getStock(supplement.id)).toBeNull()
  })

  it('余量为 0 时打卡变负数，不拦截', async () => {
    const supplement = await seedSupplement({ stockCount: 0 })
    await createIntake(checkIn(supplement.id, { amount: 2 }))
    expect(await getStock(supplement.id)).toBe(-2)
  })

  it('手动录入（origin=manual）写入记录且 isExtra=true', async () => {
    const supplement = await seedSupplement({ stockCount: 5 })
    const record = await createIntake(checkIn(supplement.id, { origin: 'manual' }))
    expect(record.isExtra).toBe(true)
    expect(await getStock(supplement.id)).toBe(4)
  })
})

describe('appendIntake · 追加一次 / 仍要服用', () => {
  it('追加一次：同键第二条记录、isExtra=true、余量再 -N', async () => {
    const supplement = await seedSupplement({ stockCount: 30 })
    await createIntake(checkIn(supplement.id, { amount: 1 }))
    const extra = await appendIntake(checkIn(supplement.id, { amount: 2, origin: 'extra' }))

    expect(extra.isExtra).toBe(true)
    expect(extra.origin).toBe('extra')
    expect(await db.dailyIntakes.count()).toBe(2)
    expect(await getStock(supplement.id)).toBe(27)
  })

  it('仍要服用走同一入口（origin=forced）', async () => {
    const supplement = await seedSupplement({ stockCount: 10 })
    const forced = await appendIntake(checkIn(supplement.id, { origin: 'forced' }))
    expect(forced.origin).toBe('forced')
    expect(forced.isExtra).toBe(true)
    expect(await getStock(supplement.id)).toBe(9)
  })

  it('用 checkin 来源调追加接口会被拒（避免语义漂移）', async () => {
    const supplement = await seedSupplement()
    await expect(appendIntake(checkIn(supplement.id, { origin: 'checkin' }))).rejects.toThrow(
      /追加/,
    )
  })
})

describe('undoIntake · 撤销', () => {
  it('撤销打卡记录：记录消失、余量精确加回', async () => {
    const supplement = await seedSupplement({ stockCount: 30 })
    const record = await createIntake(checkIn(supplement.id, { amount: 3 }))
    expect(await getStock(supplement.id)).toBe(27)

    await undoIntake(record.id)

    expect(await db.dailyIntakes.count()).toBe(0)
    expect(await getStock(supplement.id)).toBe(30)
  })

  it('撤销漏服记录：记录消失、余量不变', async () => {
    const supplement = await seedSupplement({ stockCount: 30 })
    const missed = await seedIntake({
      date: DATE,
      supplementId: supplement.id,
      taken: false,
      origin: 'manual',
      isExtra: true,
      amount: 2,
    })

    await undoIntake(missed.id)

    expect(await db.dailyIntakes.count()).toBe(0)
    expect(await getStock(supplement.id)).toBe(30)
  })

  it('撤销不存在的 id 抛「记录不存在」', async () => {
    await expect(undoIntake('not-exist')).rejects.toThrow(/记录不存在/)
  })

  it('两次撤销同一条：第二次抛错且余量不重复加回', async () => {
    const supplement = await seedSupplement({ stockCount: 10 })
    const record = await createIntake(checkIn(supplement.id, { amount: 4 }))
    await undoIntake(record.id)
    await expect(undoIntake(record.id)).rejects.toThrow(/记录不存在/)
    expect(await getStock(supplement.id)).toBe(10)
  })
})

describe('updateIntake · 修改记录', () => {
  it('修改数量：余量按差额调整（+old-new）', async () => {
    const supplement = await seedSupplement({ stockCount: 30 })
    const record = await createIntake(checkIn(supplement.id, { amount: 1 }))
    expect(await getStock(supplement.id)).toBe(29)

    await updateIntake(record.id, { amount: 3 })

    expect(await getStock(supplement.id)).toBe(27)
    expect((await db.dailyIntakes.get(record.id))?.amount).toBe(3)
  })

  it('数量不变时余量不动', async () => {
    const supplement = await seedSupplement({ stockCount: 30 })
    const record = await createIntake(checkIn(supplement.id, { amount: 2 }))
    await updateIntake(record.id, { amount: 2 })
    expect(await getStock(supplement.id)).toBe(28)
  })

  it('只改备注与时段时不动余量', async () => {
    const supplement = await seedSupplement({ stockCount: 30 })
    const record = await createIntake(checkIn(supplement.id, { amount: 2 }))

    await updateIntake(record.id, { notes: '随餐', timeSlot: 'evening' })

    expect(await getStock(supplement.id)).toBe(28)
    const updated = await db.dailyIntakes.get(record.id)
    expect(updated?.notes).toBe('随餐')
    expect(updated?.timeSlot).toBe('evening')
  })

  it('修改不存在的记录抛「记录不存在」', async () => {
    await expect(updateIntake('not-exist', { amount: 1 })).rejects.toThrow(/记录不存在/)
  })
})

describe('listByDate', () => {
  it('只返回该日记录', async () => {
    const supplement = await seedSupplement()
    await createIntake(checkIn(supplement.id))
    await createIntake(checkIn(supplement.id, { timeSlot: 'evening' }))
    await createIntake(checkIn(supplement.id, { date: '2026-09-19' }))

    expect(await listByDate(DATE)).toHaveLength(2)
  })
})
