import { db } from '@/db'
import { metaService } from '@/services/metaService'
import type { DailyIntake, DosagePlan, Ingredient, Supplement, SupplementIngredient } from '@/types'
import { newId, nowIso } from '@/utils/id'

/**
 * 测试共用夹具（§12.1）。
 * 每个用例前必须先 resetDb()，避免 fake-indexeddb 之间互相污染。
 */
export async function resetDb(): Promise<void> {
  await db.delete()
  await db.open()
  await metaService.initDefaults()
}

export function supplementFixture(overrides: Partial<Supplement> = {}): Supplement {
  const now = nowIso()
  return {
    id: newId(),
    name: '维生素 D3',
    unitType: 'pill',
    stockCount: 30,
    stockUnit: null,
    unitsPerStock: null,
    expiryDate: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

export function planFixture(supplementId: string, overrides: Partial<DosagePlan> = {}): DosagePlan {
  const now = nowIso()
  return {
    id: newId(),
    supplementId,
    amountPerTime: 1,
    timeSlots: ['morning'],
    rateMode: 'daily',
    rateOnDays: null,
    rateOffDays: null,
    rateAnchorDate: null,
    isActive: true,
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

export function intakeFixture(overrides: Partial<DailyIntake> = {}): DailyIntake {
  const now = nowIso()
  return {
    id: newId(),
    date: '2026-09-20',
    supplementId: 'supp-1',
    planId: null,
    timeSlot: 'morning',
    amount: 1,
    taken: true,
    isExtra: false,
    origin: 'checkin',
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

export async function seedSupplement(overrides: Partial<Supplement> = {}): Promise<Supplement> {
  const record = supplementFixture(overrides)
  await db.supplements.add(record)
  return record
}

export async function seedPlan(
  supplementId: string,
  overrides: Partial<DosagePlan> = {},
): Promise<DosagePlan> {
  const record = planFixture(supplementId, overrides)
  await db.dosagePlans.add(record)
  return record
}

export async function seedIntake(overrides: Partial<DailyIntake> = {}): Promise<DailyIntake> {
  const record = intakeFixture(overrides)
  await db.dailyIntakes.add(record)
  return record
}

export async function getStock(supplementId: string): Promise<number | null | undefined> {
  return (await db.supplements.get(supplementId))?.stockCount
}

// ── M3：成分与配方关联 ─────────────────────────────────────────

export function ingredientFixture(overrides: Partial<Ingredient> = {}): Ingredient {
  const now = nowIso()
  return {
    id: newId(),
    name: '维生素 D3',
    unit: 'IU',
    recommendedDailyIntake: null,
    upperLimit: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

export function linkFixture(overrides: Partial<SupplementIngredient> = {}): SupplementIngredient {
  const now = nowIso()
  return {
    id: newId(),
    supplementId: 'supp-1',
    ingredientId: 'ing-1',
    amountPerServing: 1000,
    effectiveFrom: '2026-09-01',
    effectiveTo: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

export async function seedIngredient(overrides: Partial<Ingredient> = {}): Promise<Ingredient> {
  const record = ingredientFixture(overrides)
  await db.ingredients.add(record)
  return record
}

export async function seedIngredientLink(
  overrides: Partial<SupplementIngredient> = {},
): Promise<SupplementIngredient> {
  const record = linkFixture(overrides)
  await db.supplementIngredients.add(record)
  return record
}
