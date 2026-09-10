import type { Transaction } from 'dexie'
import { db } from '@/db'
import { NOT_DELETED } from '@/constants/deletedAt'
import { STOCK_LOG_REASON, type StockLogReason } from '@/constants/enums'
import { STOCK_STATE } from '@/constants/stockState'
import type { DailyIntake, IntakeStatus, StockLog, Supplement } from '@/types'
import { newId, nowIso } from '@/utils/id'

/**
 * 库存状态机唯一入口（需求 5.6 / 6.7）。
 * intakeService 与 backfillService 不得直接操作 supplements / stockLogs。
 */
export type StockOperation =
  | { type: 'create'; intake: DailyIntake; source: 'plan' | 'manual' }
  | { type: 'softDelete'; intakeId: string }
  | { type: 'restore'; intakeId: string; unknownChoice?: 'not_deducted' | 'deducted' }
  | { type: 'updateStatus'; intakeId: string; newStatus: IntakeStatus; newActualAmount: number }
  | { type: 'updateAmount'; intakeId: string; newActualAmount: number }

const TABLES = () => [db.dailyIntakes, db.supplements, db.stockLogs]

async function writeStockLog(
  tx: Transaction,
  params: {
    supplementId: string
    delta: number
    reason: StockLogReason
    relatedIntakeId: string | null
    note?: string | null
  },
): Promise<void> {
  const log: StockLog = {
    id: newId(),
    supplementId: params.supplementId,
    deltaInUsageUnit: params.delta,
    reason: params.reason,
    relatedIntakeId: params.relatedIntakeId,
    note: params.note ?? null,
    deletedAt: NOT_DELETED,
    createdAt: nowIso(),
  }
  await tx.table('stockLogs').add(log)
}

async function getSupplement(
  tx: Transaction,
  supplementId: string,
): Promise<Supplement | undefined> {
  return tx.table('supplements').get(supplementId)
}

async function getIntake(tx: Transaction, intakeId: string): Promise<DailyIntake | undefined> {
  return tx.table('dailyIntakes').get(intakeId)
}

async function handleCreate(
  tx: Transaction,
  intake: DailyIntake,
  source: 'plan' | 'manual',
): Promise<void> {
  const now = nowIso()
  const supp = await getSupplement(tx, intake.supplementId)
  const hasStock = supp?.stockCountInUsageUnit != null
  const needDeduct = intake.status !== 'skipped' && hasStock
  const stockState = needDeduct ? STOCK_STATE.DEDUCTED : STOCK_STATE.NOT_DEDUCTED

  const record: DailyIntake = {
    ...intake,
    stockState,
    deletedAt: NOT_DELETED,
    createdAt: intake.createdAt || now,
    updatedAt: now,
  }
  await tx.table('dailyIntakes').add(record)

  if (!needDeduct || !supp) return

  await tx.table('supplements').update(supp.id, {
    stockCountInUsageUnit: (supp.stockCountInUsageUnit as number) - record.actualAmount,
    updatedAt: now,
  })
  await writeStockLog(tx, {
    supplementId: supp.id,
    delta: -record.actualAmount,
    reason: source === 'plan' ? STOCK_LOG_REASON.INTAKE : STOCK_LOG_REASON.MANUAL_INTAKE,
    relatedIntakeId: record.id,
  })
}

async function handleSoftDelete(tx: Transaction, intakeId: string): Promise<void> {
  const intake = await getIntake(tx, intakeId)
  if (!intake || intake.deletedAt !== NOT_DELETED) return // 幂等

  const now = nowIso()

  if (intake.stockState === STOCK_STATE.DEDUCTED) {
    const supp = await getSupplement(tx, intake.supplementId)
    if (supp && supp.stockCountInUsageUnit != null) {
      await tx.table('supplements').update(supp.id, {
        stockCountInUsageUnit: supp.stockCountInUsageUnit + intake.actualAmount,
        updatedAt: now,
      })
      await writeStockLog(tx, {
        supplementId: supp.id,
        delta: intake.actualAmount,
        reason: STOCK_LOG_REASON.UNDO_INTAKE,
        relatedIntakeId: intake.id,
      })
    }
    await tx.table('dailyIntakes').update(intakeId, {
      stockState: STOCK_STATE.WAS_DEDUCTED,
      deletedAt: now,
      updatedAt: now,
    })
    return
  }

  // not_deducted：不改 stockState
  await tx.table('dailyIntakes').update(intakeId, { deletedAt: now, updatedAt: now })
}

async function handleRestore(
  tx: Transaction,
  intakeId: string,
  unknownChoice?: 'not_deducted' | 'deducted',
): Promise<void> {
  const intake = await getIntake(tx, intakeId)
  if (!intake || intake.deletedAt === NOT_DELETED) return // 幂等

  const now = nowIso()
  let nextStockState = intake.stockState

  if (intake.stockState === STOCK_STATE.UNKNOWN) {
    if (!unknownChoice) {
      throw new Error('该记录来自旧版本，库存状态未知，请先选择"视为未扣"或"视为已扣"')
    }
    if (unknownChoice === 'deducted') {
      const supp = await getSupplement(tx, intake.supplementId)
      if (supp && supp.stockCountInUsageUnit != null) {
        await tx.table('supplements').update(supp.id, {
          stockCountInUsageUnit: supp.stockCountInUsageUnit - intake.actualAmount,
          updatedAt: now,
        })
      }
      await writeStockLog(tx, {
        supplementId: intake.supplementId,
        delta: -intake.actualAmount,
        reason: STOCK_LOG_REASON.ADJUST,
        relatedIntakeId: intake.id,
        note: 'unknown 恢复时用户选"视为已扣"',
      })
      nextStockState = STOCK_STATE.DEDUCTED
    } else {
      nextStockState = STOCK_STATE.NOT_DEDUCTED
    }
  } else if (intake.stockState === STOCK_STATE.WAS_DEDUCTED) {
    const supp = await getSupplement(tx, intake.supplementId)
    if (supp && supp.stockCountInUsageUnit != null) {
      await tx.table('supplements').update(supp.id, {
        stockCountInUsageUnit: supp.stockCountInUsageUnit - intake.actualAmount,
        updatedAt: now,
      })
    }
    await writeStockLog(tx, {
      supplementId: intake.supplementId,
      delta: -intake.actualAmount,
      reason: STOCK_LOG_REASON.INTAKE,
      relatedIntakeId: intake.id,
    })
    nextStockState = STOCK_STATE.DEDUCTED
  }
  // not_deducted：不重扣，状态不变

  await tx.table('dailyIntakes').update(intakeId, {
    stockState: nextStockState,
    deletedAt: NOT_DELETED,
    updatedAt: now,
  })
}

async function handleUpdateStatus(
  tx: Transaction,
  intakeId: string,
  newStatus: IntakeStatus,
  newActualAmount: number,
): Promise<void> {
  const intake = await getIntake(tx, intakeId)
  if (!intake) throw new Error('记录不存在')
  if (intake.deletedAt !== NOT_DELETED) {
    throw new Error('请先恢复该记录再修改')
  }

  const now = nowIso()
  const supp = await getSupplement(tx, intake.supplementId)
  const newNeedDeduct = newStatus !== 'skipped' && supp?.stockCountInUsageUnit != null

  // 中间态全部在内存中计算，事务内只做一次最终写入（M-6）
  let stock = supp?.stockCountInUsageUnit ?? null
  let nextStockState = intake.stockState

  if (intake.stockState === STOCK_STATE.DEDUCTED && stock != null) {
    stock += intake.actualAmount
    await writeStockLog(tx, {
      supplementId: intake.supplementId,
      delta: intake.actualAmount,
      reason: STOCK_LOG_REASON.ADJUST,
      relatedIntakeId: intake.id,
      note: '历史修正改状态：回滚',
    })
    nextStockState = STOCK_STATE.NOT_DEDUCTED
  }

  if (newNeedDeduct && stock != null) {
    stock -= newActualAmount
    await writeStockLog(tx, {
      supplementId: intake.supplementId,
      delta: -newActualAmount,
      reason: STOCK_LOG_REASON.ADJUST,
      relatedIntakeId: intake.id,
      note: '历史修正改状态：补扣',
    })
    nextStockState = STOCK_STATE.DEDUCTED
  }

  if (supp && stock != null) {
    await tx.table('supplements').update(supp.id, {
      stockCountInUsageUnit: stock,
      updatedAt: now,
    })
  }

  await tx.table('dailyIntakes').update(intakeId, {
    status: newStatus,
    actualAmount: newActualAmount,
    stockState: nextStockState,
    updatedAt: now,
  })
}

async function handleUpdateAmount(
  tx: Transaction,
  intakeId: string,
  newActualAmount: number,
): Promise<void> {
  const intake = await getIntake(tx, intakeId)
  if (!intake) throw new Error('记录不存在')
  if (intake.deletedAt !== NOT_DELETED) {
    throw new Error('请先恢复该记录再修改')
  }

  const now = nowIso()
  const delta = newActualAmount - intake.actualAmount

  if (intake.stockState === STOCK_STATE.DEDUCTED && delta !== 0) {
    const supp = await getSupplement(tx, intake.supplementId)
    if (supp && supp.stockCountInUsageUnit != null) {
      await tx.table('supplements').update(supp.id, {
        stockCountInUsageUnit: supp.stockCountInUsageUnit - delta,
        updatedAt: now,
      })
      await writeStockLog(tx, {
        supplementId: supp.id,
        delta: -delta,
        reason: STOCK_LOG_REASON.ADJUST,
        relatedIntakeId: intake.id,
        note: '历史修正改量',
      })
    }
  }

  await tx.table('dailyIntakes').update(intakeId, {
    actualAmount: newActualAmount,
    updatedAt: now,
  })
}

async function applyTransitionCore(tx: Transaction, op: StockOperation): Promise<void> {
  switch (op.type) {
    case 'create':
      return handleCreate(tx, op.intake, op.source)
    case 'softDelete':
      return handleSoftDelete(tx, op.intakeId)
    case 'restore':
      return handleRestore(tx, op.intakeId, op.unknownChoice)
    case 'updateStatus':
      return handleUpdateStatus(tx, op.intakeId, op.newStatus, op.newActualAmount)
    case 'updateAmount':
      return handleUpdateAmount(tx, op.intakeId, op.newActualAmount)
  }
}

/** 单条操作：自建事务 */
export async function applyTransition(op: StockOperation): Promise<void> {
  await db.transaction('rw', TABLES(), async (tx) => {
    await applyTransitionCore(tx, op)
  })
}

/** 批量操作：复用外部事务 */
export async function applyTransitionInTx(tx: Transaction, op: StockOperation): Promise<void> {
  await applyTransitionCore(tx, op)
}

/** 批量封装：所有 op 在同一个 Dexie 事务内 */
export async function applyTransitionBatch(ops: StockOperation[]): Promise<void> {
  if (ops.length === 0) return
  await db.transaction('rw', TABLES(), async (tx) => {
    for (const op of ops) {
      await applyTransitionCore(tx, op)
    }
  })
}
