import { db } from '@/db'
import { INTAKE_ORIGIN, type IntakeOrigin, type TimeSlot } from '@/constants/enums'
import { dailyIntakeRepository } from '@/repositories'
import { parseOrThrow } from '@/schemas/common'
import { DailyIntakeCreateSchema, DailyIntakeUpdateSchema } from '@/schemas/dailyIntake'
import type { DailyIntake } from '@/types'
import { publishDataChange } from '@/utils/broadcast'
import { nowIso } from '@/utils/id'
import { buildIntake } from '@/utils/intakeFactory'
import { applyStockDelta } from './stockAdjust'

/**
 * 记录用例（实施指导书 §7.3）★ 打卡 5 秒闭环的写入口。
 *
 * 余量规则（§6.5，全部在同一个事务内）：
 *   createIntake: insert(record) + 若 taken → stockCount -= amount
 *   appendIntake: insert(record) + 若 taken → stockCount -= amount
 *   undoIntake:   delete(record) + 若 taken → stockCount += amount
 *   updateIntake: 若 amount 变化且 taken → stockCount += oldAmount - newAmount
 * 余量为 null 表示「不记录余量」，全部余量逻辑跳过；允许为负，不拦截。
 */

export interface CheckInInput {
  date: string
  supplementId: string
  planId: string | null
  timeSlot: TimeSlot
  amount: number
  origin: IntakeOrigin
}

/**
 * 重复打卡。UI 用 error.name 判断，不要匹配中文文案（§7.3）。
 */
export class DuplicateIntakeError extends Error {
  constructor() {
    super('今天已打卡')
    this.name = 'DuplicateIntakeError'
  }
}

/** 本模块只写「已服用」；标漏服走 backfillService（§7.5） */
function buildRecord(input: CheckInInput): DailyIntake {
  return buildIntake({ ...input, taken: true, notes: null })
}

/**
 * 打卡 / 手动录入的统一写入口。
 *
 * 幂等：同 (date, supplementId, timeSlot) 已存在 taken=true 记录 → 抛 DuplicateIntakeError，
 * UI 捕获后行内提示「今天已打卡」并提供「追加一次」。
 */
export async function createIntake(input: CheckInInput): Promise<DailyIntake> {
  const record = parseOrThrow(DailyIntakeCreateSchema, buildRecord(input))

  await db.transaction('rw', db.dailyIntakes, db.supplements, async () => {
    const rows = await db.dailyIntakes
      .where('[date+supplementId]')
      .equals([record.date, record.supplementId])
      .toArray()
    if (rows.some((row) => row.timeSlot === record.timeSlot && row.taken)) {
      throw new DuplicateIntakeError()
    }
    await db.dailyIntakes.add(record)
    await applyStockDelta(record.supplementId, -record.amount)
  })

  publishDataChange()
  return record
}

/**
 * 追加一次（跳过幂等检查）。用于「一天吃了两次」。
 * 仍要服用走同一个函数，origin='forced'（P5：不弹确认）。
 */
export async function appendIntake(input: CheckInInput): Promise<DailyIntake> {
  if (input.origin === INTAKE_ORIGIN.CHECKIN) {
    throw new Error('「追加一次」必须使用追加来源，不能记为计划打卡')
  }
  const record = parseOrThrow(DailyIntakeCreateSchema, buildRecord(input))

  await db.transaction('rw', db.dailyIntakes, db.supplements, async () => {
    await db.dailyIntakes.add(record)
    await applyStockDelta(record.supplementId, -record.amount)
  })

  publishDataChange()
  return record
}

/** 撤销：硬删除 + 余量加回。不弹二次确认（§4.6 / R-15） */
export async function undoIntake(id: string): Promise<void> {
  await db.transaction('rw', db.dailyIntakes, db.supplements, async () => {
    const record = await db.dailyIntakes.get(id)
    if (!record) throw new Error('记录不存在')
    await db.dailyIntakes.delete(id)
    if (record.taken) await applyStockDelta(record.supplementId, record.amount)
  })

  publishDataChange()
}

/** 修改记录（数量 / 时段 / 备注）。数量变化时同步调整余量 */
export async function updateIntake(
  id: string,
  patch: { amount?: number; timeSlot?: TimeSlot; notes?: string | null },
): Promise<void> {
  await db.transaction('rw', db.dailyIntakes, db.supplements, async () => {
    const record = await db.dailyIntakes.get(id)
    if (!record) throw new Error('记录不存在')

    const parsed = parseOrThrow(DailyIntakeUpdateSchema, patch)
    await db.dailyIntakes.update(id, { ...parsed, updatedAt: nowIso() })

    if (record.taken && parsed.amount !== undefined && parsed.amount !== record.amount) {
      await applyStockDelta(record.supplementId, record.amount - parsed.amount)
    }
  })

  publishDataChange()
}

/** 按日的记录查询（页面用） */
export async function listByDate(date: string): Promise<DailyIntake[]> {
  return dailyIntakeRepository.listByDate(date)
}
