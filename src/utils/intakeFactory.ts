import { INTAKE_ORIGIN, type IntakeOrigin, type TimeSlot } from '@/constants/enums'
import type { DailyIntake } from '@/types'
import { newId, nowIso } from './id'

/**
 * 记录构造工厂（实施指导书 §7.3 / T-201）。
 *
 * 打卡、追加、补录、手动录入、仍要服用五条路径**必须**共用这一个构造函数 ——
 * 否则 isExtra 与 origin 的一致性（DIFF-01）会散落到五个地方，迟早有一条写歪。
 *
 * 纯函数：不 import db。
 */

export interface BuildIntakeInput {
  /** 服用归属日期；补录时为用户所选的历史日期 */
  date: string
  supplementId: string
  /** null / 空串 = 无计划（手动录入 / 休息日仍要服用） */
  planId: string | null
  timeSlot: TimeSlot
  amount: number
  /** true 吃了 / false 标记漏服 */
  taken: boolean
  origin: IntakeOrigin
  notes?: string | null
}

export function buildIntake(input: BuildIntakeInput): DailyIntake {
  const now = nowIso()
  return {
    id: newId(),
    date: input.date,
    supplementId: input.supplementId,
    planId: input.planId,
    timeSlot: input.timeSlot,
    amount: input.amount,
    taken: input.taken,
    // R-16 / DIFF-01：isExtra 由 origin 派生，不接受调用方另行指定
    isExtra: input.origin !== INTAKE_ORIGIN.CHECKIN,
    origin: input.origin,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  }
}
