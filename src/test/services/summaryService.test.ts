import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { NOT_DELETED } from '@/constants/deletedAt'
import { summarizeDate } from '@/services/summaryService'
import { newId, nowIso } from '@/utils/id'
import type { DailyIntake, Ingredient, Supplement } from '@/types'

async function supp(overrides: Partial<Supplement> = {}) {
  const record: Supplement = {
    id: newId(),
    name: '复合维生素',
    brand: null,
    description: null,
    unitType: 'tablet',
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

async function ing(name: string, unit: Ingredient['unit'], id = newId()) {
  const record: Ingredient = {
    id,
    name,
    unit,
    recommendedDailyIntake: null,
    upperLimit: null,
    description: null,
    deletedAt: NOT_DELETED,
  }
  await db.ingredients.add(record)
  return record
}

async function link(supplementId: string, ingredientId: string, amountPerServing: number) {
  await db.supplementIngredients.add({
    id: newId(),
    supplementId,
    ingredientId,
    amountPerServing,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    deletedAt: NOT_DELETED,
    createdAt: nowIso(),
    updatedAt: nowIso(),
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
    actualAmount: 1,
    timeSlot: 'morning',
    status: 'taken',
    source: 'manual',
    notes: null,
    stockState: 'not_deducted',
    deletedAt: NOT_DELETED,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('成分汇总', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('按日期累加，重量类归一化到 μg', async () => {
    const s = await supp()
    const d = await ing('维生素D', 'μg')
    const calcium = await ing('钙', 'mg')
    await link(s.id, d.id, 25)
    await link(s.id, calcium.id, 200)

    await db.dailyIntakes.add(intake(s.id, { actualAmount: 2 }))

    const totals = await summarizeDate('2026-09-10')
    const vitaminD = totals.find((t) => t.ingredientId === d.id)
    const calciumTotal = totals.find((t) => t.ingredientId === calcium.id)

    expect(vitaminD?.total).toBe(50)
    expect(vitaminD?.displayUnit).toBe('μg')
    expect(calciumTotal?.total).toBe(400_000)
    expect(calciumTotal?.displayUnit).toBe('mg')
    expect(calciumTotal?.displayValue).toBe(400)
  })

  it('IU 与 ml 独立累加，不与 μg 合并', async () => {
    const s = await supp()
    const iu = await ing('维生素A', 'IU')
    await link(s.id, iu.id, 100)
    await db.dailyIntakes.add(intake(s.id, { actualAmount: 3 }))

    const totals = await summarizeDate('2026-09-10')
    expect(totals).toHaveLength(1)
    expect(totals[0].total).toBe(300)
    expect(totals[0].unit).toBe('IU')
  })

  it('只统计未删除记录，且 skipped 不计入', async () => {
    const s = await supp()
    const d = await ing('维生素D', 'μg')
    await link(s.id, d.id, 25)

    await db.dailyIntakes.add(intake(s.id))
    await db.dailyIntakes.add(
      intake(s.id, { deletedAt: nowIso(), stockState: 'was_deducted', timeSlot: 'noon' }),
    )
    await db.dailyIntakes.add(intake(s.id, { status: 'skipped', timeSlot: 'evening' }))

    const totals = await summarizeDate('2026-09-10')
    expect(totals[0].total).toBe(25)
  })

  it('孤儿记录仍计入并标注含已删除补剂', async () => {
    const s = await supp({ deletedAt: nowIso() })
    const d = await ing('维生素D', 'μg')
    await link(s.id, d.id, 25)
    await db.dailyIntakes.add(intake(s.id))

    const totals = await summarizeDate('2026-09-10')
    expect(totals[0].total).toBe(25)
    expect(totals[0].hasDeletedSupplement).toBe(true)
    expect(totals[0].sources[0].supplementName).toBe('[已删除的补剂]')
  })

  it('按 date 匹配当时配方版本', async () => {
    const s = await supp()
    const d = await ing('维生素D', 'μg')
    await db.supplementIngredients.add({
      id: newId(),
      supplementId: s.id,
      ingredientId: d.id,
      amountPerServing: 10,
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-06-30',
      deletedAt: NOT_DELETED,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
    await db.supplementIngredients.add({
      id: newId(),
      supplementId: s.id,
      ingredientId: d.id,
      amountPerServing: 40,
      effectiveFrom: '2026-07-01',
      effectiveTo: null,
      deletedAt: NOT_DELETED,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })

    await db.dailyIntakes.add(intake(s.id, { date: '2026-03-01' }))
    await db.dailyIntakes.add(intake(s.id, { date: '2026-09-10', timeSlot: 'noon' }))

    expect((await summarizeDate('2026-03-01'))[0].total).toBe(10)
    expect((await summarizeDate('2026-09-10'))[0].total).toBe(40)
  })
})
