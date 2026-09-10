import { db } from '@/db'
import { NOT_DELETED } from '@/constants/deletedAt'
import { dailyIntakeRepository } from '@/repositories'
import { DailyIntakeCreateSchema, DailyIntakeUpdateSchema } from '@/schemas/dailyIntake'
import type { DailyIntakeCreateInput, DailyIntakeUpdateInput } from '@/schemas/dailyIntake'
import type { DailyIntake } from '@/types'
import { publishDataChange } from '@/utils/broadcast'
import { backfillRange, today } from '@/utils/date'
import { nowIso } from '@/utils/id'
import { invalidateMissedCache } from '@/utils/missedCache'
import { metaService } from './metaService'
import { applyTransition, applyTransitionInTx } from './stockService'

export type IntakeDateMode = 'today' | 'backfill' | 'update'

export async function validateIntakeDate(date: string, mode: IntakeDateMode): Promise<void> {
  switch (mode) {
    case 'today':
      if (date !== today()) throw new Error('今日录入的日期必须是今天')
      return
    case 'backfill': {
      const windowDays = await metaService.getBackfillWindowDays()
      const { min, max } = backfillRange(windowDays)
      if (date > max) throw new Error('补录日期不能是今天或未来')
      if (date < min) throw new Error(`补录日期不能早于 ${min}`)
      return
    }
    case 'update':
      // 历史修正不受范围限制
      return
  }
}

export async function createIntake(
  input: DailyIntakeCreateInput,
  mode: IntakeDateMode,
): Promise<DailyIntake> {
  await validateIntakeDate(input.date, mode)

  if (mode === 'today' && input.source === 'manual' && input.status === 'skipped') {
    throw new Error('今日漏服请明日通过补录功能标记')
  }

  const parsed = DailyIntakeCreateSchema.parse(input) as DailyIntake

  await db.transaction('rw', db.dailyIntakes, db.supplements, db.stockLogs, async (tx) => {
    // 事务内二次校验重复（补录/打卡共用）
    const rows: DailyIntake[] = await tx
      .table('dailyIntakes')
      .where('[date+supplementId]')
      .equals([parsed.date, parsed.supplementId])
      .toArray()
    const duplicated = rows.some(
      (r) => r.timeSlot === parsed.timeSlot && r.deletedAt === NOT_DELETED,
    )
    if (duplicated) throw new Error('该时段已有记录')

    await applyTransitionInTx(tx, { type: 'create', intake: parsed, source: parsed.source })
  })

  publishDataChange()
  return parsed
}

export async function updateIntake(
  id: string,
  patch: DailyIntakeUpdateInput,
  mode: IntakeDateMode,
): Promise<DailyIntake> {
  const record = await dailyIntakeRepository.get(id)
  if (!record) throw new Error('记录不存在')
  if (record.deletedAt !== NOT_DELETED) {
    throw new Error('请先恢复该记录再修改')
  }

  await validateIntakeDate(patch.date ?? record.date, mode)
  const parsed = DailyIntakeUpdateSchema.parse(patch)

  const nextStatus = parsed.status ?? record.status
  const nextAmount = parsed.actualAmount ?? record.actualAmount

  if (nextStatus !== record.status) {
    await applyTransition({
      type: 'updateStatus',
      intakeId: id,
      newStatus: nextStatus,
      newActualAmount: nextAmount,
    })
  } else if (nextAmount !== record.actualAmount) {
    await applyTransition({ type: 'updateAmount', intakeId: id, newActualAmount: nextAmount })
  }

  const rest = { ...parsed }
  delete rest.status
  delete rest.actualAmount
  if (Object.keys(rest).length > 0) {
    await dailyIntakeRepository.update(id, { ...rest, updatedAt: nowIso() })
  }

  publishDataChange()
  return (await dailyIntakeRepository.get(id)) as DailyIntake
}

export async function softDeleteIntake(id: string): Promise<void> {
  await applyTransition({ type: 'softDelete', intakeId: id })
  invalidateMissedCache()
  publishDataChange()
}

export async function restoreIntake(
  id: string,
  unknownChoice?: 'not_deducted' | 'deducted',
): Promise<void> {
  await applyTransition({ type: 'restore', intakeId: id, unknownChoice })
  invalidateMissedCache()
  publishDataChange()
}

/** 彻底删除：仅物理删除，不触碰库存 */
export async function purgeIntake(id: string): Promise<void> {
  await dailyIntakeRepository.purge(id)
  publishDataChange()
}
