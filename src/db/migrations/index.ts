import { DEFAULT_BACKFILL_WINDOW_DAYS, META_KEY } from '@/constants/enums'

/**
 * 旧版本数据迁移（决策 D1）：新库直接从 v10.1 schema 起步，
 * 迁移以纯函数形式存在，由 services/importService 在导入旧文件时按 schemaVersion 依次调用。
 * 所有函数必须幂等且可单测。
 */

export const SCHEMA_VERSION = 10

type RawRecord = Record<string, unknown>

export interface MigrationPayload {
  meta: Record<string, unknown>
  data: Record<string, RawRecord[]>
}

type Migration = (payload: MigrationPayload) => MigrationPayload

function isDeletedFlag(value: unknown): boolean {
  return value != null && value !== 0
}

function supplementMap(data: Record<string, RawRecord[]>) {
  const map = new Map<string, RawRecord>()
  for (const supp of data.supplements ?? []) {
    map.set(String(supp.id), supp)
  }
  return map
}

/** v3 → v4：DailyIntake 新增 stockDeducted / stockRollbackState */
export const migrateV3toV4: Migration = (payload) => {
  const supps = supplementMap(payload.data)
  payload.data.dailyIntakes = (payload.data.dailyIntakes ?? []).map((row) => {
    const deleted = isDeletedFlag(row.deletedAt)
    if (deleted) {
      return { ...row, stockDeducted: true, stockRollbackState: 'unknown' }
    }
    const supp = supps.get(String(row.supplementId))
    return {
      ...row,
      stockDeducted: supp ? supp.stockCountInUsageUnit != null : false,
      stockRollbackState: 'not_rolled_back',
    }
  })
  return payload
}

/** v4 → v5：所有表 deletedAt 由 null 改为 0 */
export const migrateV4toV5: Migration = (payload) => {
  for (const table of Object.keys(payload.data)) {
    payload.data[table] = (payload.data[table] ?? []).map((row) => ({
      ...row,
      deletedAt: row.deletedAt === null ? 0 : row.deletedAt,
    }))
  }
  return payload
}

/** v5 → v6：stockDeducted 回填、stockRolledBack 转 stockRollbackState 并删除旧字段 */
export const migrateV5toV6: Migration = (payload) => {
  const supps = supplementMap(payload.data)
  payload.data.dailyIntakes = (payload.data.dailyIntakes ?? []).map((row) => {
    const next = { ...row }
    if (next.stockDeducted === undefined || next.stockDeducted === null) {
      const supp = supps.get(String(row.supplementId))
      next.stockDeducted = isDeletedFlag(row.deletedAt)
        ? true
        : supp
          ? supp.stockCountInUsageUnit != null
          : false
    }
    if (next.stockRollbackState === undefined || next.stockRollbackState === null) {
      if (next.stockRolledBack === true) next.stockRollbackState = 'rolled_back'
      else if (next.stockRolledBack === false) next.stockRollbackState = 'not_rolled_back'
      else next.stockRollbackState = 'unknown'
    }
    delete next.stockRolledBack
    return next
  })
  return payload
}

/** v6 → v7：无 Schema 变更，仅 Meta 新增 backfillWindowDays */
export const migrateV6toV7: Migration = (payload) => {
  if (payload.meta[META_KEY.BACKFILL_WINDOW_DAYS] === undefined) {
    payload.meta[META_KEY.BACKFILL_WINDOW_DAYS] = DEFAULT_BACKFILL_WINDOW_DAYS
  }
  return payload
}

/** v7 → v8：无 Schema 变更（Zod 放宽、StockLog 索引改普通索引） */
export const migrateV7toV8: Migration = (payload) => payload

/** v8 → v9：stockDeducted + stockRollbackState 合并为 stockState 三态 */
export const migrateV8toV9: Migration = (payload) => {
  payload.data.dailyIntakes = (payload.data.dailyIntakes ?? []).map((row) => {
    const next = { ...row }
    const rollback = next.stockRollbackState
    const deducted = next.stockDeducted === true
    if (rollback === 'unknown') next.stockState = 'unknown'
    else if (deducted && rollback === 'not_rolled_back') next.stockState = 'deducted'
    else next.stockState = 'not_deducted'
    delete next.stockDeducted
    delete next.stockRollbackState
    return next
  })
  return payload
}

/** v9 → v10：三态转四态 + 新增 plannedAmountSnapshot / plannedAmountSource */
export const migrateV9toV10: Migration = (payload) => {
  payload.data.dailyIntakes = (payload.data.dailyIntakes ?? []).map((row) => {
    const next = { ...row }
    if (isDeletedFlag(row.deletedAt) && next.stockState === 'deducted') {
      next.stockState = 'was_deducted'
    }
    const planned = next.plannedAmount ?? null
    next.plannedAmountSnapshot = planned
    next.plannedAmountSource = planned != null ? 'plan_snapshot' : 'unavailable'
    return next
  })
  return payload
}

/** v10 → v10.1：无 Schema 变更（Zod refine 放宽、StockLog 新增复合索引） */
export const migrateV10toV10_1: Migration = (payload) => payload

const CHAIN: Array<{ from: number; run: Migration }> = [
  { from: 3, run: migrateV3toV4 },
  { from: 4, run: migrateV4toV5 },
  { from: 5, run: migrateV5toV6 },
  { from: 6, run: migrateV6toV7 },
  { from: 7, run: migrateV7toV8 },
  { from: 8, run: migrateV8toV9 },
  { from: 9, run: migrateV9toV10 },
  { from: 10, run: migrateV10toV10_1 },
]

/** 按 fromVersion 依次执行迁移链，返回迁移后的 payload 与目标版本 */
export function migratePayload(
  payload: MigrationPayload,
  fromVersion: number,
): { payload: MigrationPayload; version: number } {
  let current = payload
  for (const step of CHAIN) {
    if (step.from >= fromVersion) {
      current = step.run(current)
    }
  }
  current.meta[META_KEY.SCHEMA_VERSION] = SCHEMA_VERSION
  return { payload: current, version: SCHEMA_VERSION }
}
