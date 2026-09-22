import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import {
  BackfillNotAllowedError,
  backfillOne,
  listBackfillableItems,
} from '@/services/backfillService'
import { createPausePeriod } from '@/services/pauseService'
import { addDays, today } from '@/utils/date'
import { getStock, resetDb, seedPlan, seedSupplement } from '../helpers/db'

/**
 * 补录（§7.5 / T-202 / T-210）。
 *
 * 窗口是相对「今天」的，所以日期全部用 addDays(today(), -n) 算 ——
 * 写死日期的用例过几天就全红了。
 */
const TODAY = today()
const YESTERDAY = addDays(TODAY, -1)
const TWO_DAYS_AGO = addDays(TODAY, -2)
const EIGHT_DAYS_AGO = addDays(TODAY, -8)

beforeEach(async () => {
  await resetDb()
})

function input(supplementId: string, overrides: Record<string, unknown> = {}) {
  return {
    date: YESTERDAY,
    supplementId,
    timeSlot: 'morning' as const,
    amount: 1,
    taken: true,
    ...overrides,
  }
}

describe('backfillOne · 窗口', () => {
  it('补录昨天成功：origin=backfill、isExtra=true、余量扣掉这一次', async () => {
    const supplement = await seedSupplement({ stockCount: 30 })
    await seedPlan(supplement.id)

    const record = await backfillOne(input(supplement.id, { amount: 2 }))

    expect(record.date).toBe(YESTERDAY)
    expect(record.taken).toBe(true)
    expect(record.origin).toBe('backfill')
    expect(record.isExtra).toBe(true)
    expect(await db.dailyIntakes.count()).toBe(1)
    expect(await getStock(supplement.id)).toBe(28)
  })

  it('补录今天被拒（今天走今日页打卡，不该有第二条路径）', async () => {
    const supplement = await seedSupplement()
    await seedPlan(supplement.id)

    await expect(backfillOne(input(supplement.id, { date: TODAY }))).rejects.toBeInstanceOf(
      BackfillNotAllowedError,
    )
    await expect(backfillOne(input(supplement.id, { date: TODAY }))).rejects.toThrow(/今天|未来/)
    expect(await db.dailyIntakes.count()).toBe(0)
  })

  it('补录 8 天前被拒（窗口严格 7 天）', async () => {
    const supplement = await seedSupplement()
    await seedPlan(supplement.id)

    await expect(backfillOne(input(supplement.id, { date: EIGHT_DAYS_AGO }))).rejects.toThrow(
      /窗口/,
    )
    expect(await db.dailyIntakes.count()).toBe(0)
  })

  it('正好 7 天前是可补录的最早一天（边界含在内）', async () => {
    const supplement = await seedSupplement()
    await seedPlan(supplement.id)
    const sevenDaysAgo = addDays(TODAY, -7)

    const record = await backfillOne(input(supplement.id, { date: sevenDaysAgo }))
    expect(record.date).toBe(sevenDaysAgo)
  })
})

describe('backfillOne · 状态', () => {
  it('标「漏服」（taken=false）：入库但余量不变 —— 没吃就不该扣药', async () => {
    const supplement = await seedSupplement({ stockCount: 30 })
    await seedPlan(supplement.id)

    const record = await backfillOne(input(supplement.id, { taken: false, amount: 1 }))

    expect(record.taken).toBe(false)
    expect(record.origin).toBe('backfill')
    expect(await db.dailyIntakes.count()).toBe(1)
    expect(await getStock(supplement.id)).toBe(30)
  })

  it('漏服也会被记录（「我那天忘了吃」必须留痕）', async () => {
    const supplement = await seedSupplement()
    await seedPlan(supplement.id)
    await backfillOne(input(supplement.id, { taken: false }))

    const rows = await db.dailyIntakes.where('date').equals(YESTERDAY).toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].taken).toBe(false)
  })
})

describe('backfillOne · 服务层二次拦截（不只靠 UI 不给入口）', () => {
  it('休息日不允许补录', async () => {
    const supplement = await seedSupplement()
    // 起点 = 前天；on 1 / off 1 → 昨天是休息日
    await seedPlan(supplement.id, {
      rateMode: 'cyclic',
      rateOnDays: 1,
      rateOffDays: 1,
      rateAnchorDate: TWO_DAYS_AGO,
    })

    await expect(backfillOne(input(supplement.id))).rejects.toThrow(/休息日/)
    expect(await db.dailyIntakes.count()).toBe(0)
  })

  it('停用日不允许补录', async () => {
    const supplement = await seedSupplement()
    await seedPlan(supplement.id)
    await createPausePeriod({
      schemeId: null,
      supplementId: supplement.id,
      startDate: addDays(TODAY, -3),
      endDate: YESTERDAY,
      reason: '胃不舒服',
    })

    await expect(backfillOne(input(supplement.id))).rejects.toThrow(/停用/)
    expect(await db.dailyIntakes.count()).toBe(0)
  })

  it('该日已有记录 → 不允许再补一条', async () => {
    const supplement = await seedSupplement({ stockCount: 30 })
    await seedPlan(supplement.id)
    await backfillOne(input(supplement.id))

    await expect(backfillOne(input(supplement.id))).rejects.toThrow(/已有记录/)
    expect(await db.dailyIntakes.count()).toBe(1)
    expect(await getStock(supplement.id)).toBe(29)
  })

  it('该补剂在该日不在应服清单里（起点在未来）→ 拒绝', async () => {
    const supplement = await seedSupplement()
    await seedPlan(supplement.id, {
      rateMode: 'cyclic',
      rateOnDays: 1,
      rateOffDays: 1,
      rateAnchorDate: TODAY,
    })

    await expect(backfillOne(input(supplement.id))).rejects.toThrow()
    expect(await db.dailyIntakes.count()).toBe(0)
  })

  it('该补剂没有启用计划 → 拒绝', async () => {
    const supplement = await seedSupplement()
    await expect(backfillOne(input(supplement.id))).rejects.toThrow()
  })
})

describe('listBackfillableItems', () => {
  it('列出该日应服但还没记录的项', async () => {
    const supplement = await seedSupplement()
    const plan = await seedPlan(supplement.id, { timeSlots: ['morning', 'evening'] })

    const items = await listBackfillableItems(YESTERDAY)

    expect(items).toHaveLength(2)
    expect(items.map((item) => item.timeSlot).sort()).toEqual(['evening', 'morning'])
    expect(items[0].planId).toBe(plan.id)
    expect(items[0].amountDue).toBe(1)
  })

  it('已有记录的项不再列出（含已标漏服的）', async () => {
    const supplement = await seedSupplement()
    await seedPlan(supplement.id, { timeSlots: ['morning', 'evening'] })

    await backfillOne(input(supplement.id, { timeSlot: 'morning', taken: false }))

    const items = await listBackfillableItems(YESTERDAY)
    expect(items.map((item) => item.timeSlot)).toEqual(['evening'])
  })

  it('休息日没有可补录项', async () => {
    const supplement = await seedSupplement()
    await seedPlan(supplement.id, {
      rateMode: 'cyclic',
      rateOnDays: 1,
      rateOffDays: 1,
      rateAnchorDate: TWO_DAYS_AGO,
    })

    expect(await listBackfillableItems(YESTERDAY)).toEqual([])
  })

  it('停用日没有可补录项', async () => {
    const supplement = await seedSupplement()
    await seedPlan(supplement.id)
    await createPausePeriod({
      schemeId: null,
      supplementId: supplement.id,
      startDate: addDays(TODAY, -3),
      endDate: YESTERDAY,
      reason: null,
    })

    expect(await listBackfillableItems(YESTERDAY)).toEqual([])
  })

  it('窗口外（今天 / 8 天前）一律返回空 —— 日历据此换成「超出补录窗口」', async () => {
    const supplement = await seedSupplement()
    await seedPlan(supplement.id)

    expect(await listBackfillableItems(TODAY)).toEqual([])
    expect(await listBackfillableItems(EIGHT_DAYS_AGO)).toEqual([])
  })

  it('完整覆盖补录窗口内的每一天都不抛错', async () => {
    const supplement = await seedSupplement()
    await seedPlan(supplement.id)

    for (let n = 1; n <= 7; n++) {
      await expect(listBackfillableItems(addDays(TODAY, -n))).resolves.toHaveLength(1)
    }
  })
})
