import { NOT_DELETED } from '@/constants/deletedAt'
import { PLANNED_AMOUNT_SOURCE } from '@/constants/enums'
import type { DailyIntakeCreateInput } from '@/schemas/dailyIntake'
import type { IntakeSource, IntakeStatus, PlannedAmountSource, TimeSlot } from '@/types'
import { newId, nowIso } from '@/utils/id'

export interface BuildIntakeParams {
  date: string
  supplementId: string
  timeSlot: TimeSlot
  actualAmount: number
  status: IntakeStatus
  source: IntakeSource
  planId?: string | null
  plannedAmountSnapshot?: number | null
  plannedAmountSource?: PlannedAmountSource
  notes?: string | null
}

/** 构造一条待写入的 DailyIntake（stockState 由库存状态机最终决定） */
export function buildIntake(params: BuildIntakeParams): DailyIntakeCreateInput {
  const now = nowIso()
  return {
    id: newId(),
    date: params.date,
    supplementId: params.supplementId,
    planId: params.planId ?? null,
    plannedAmount: null,
    plannedAmountSnapshot: params.plannedAmountSnapshot ?? null,
    plannedAmountSource: params.plannedAmountSource ?? PLANNED_AMOUNT_SOURCE.UNAVAILABLE,
    actualAmount: params.actualAmount,
    timeSlot: params.timeSlot,
    status: params.status,
    source: params.source,
    notes: params.notes ?? null,
    stockState: params.status === 'skipped' ? 'not_deducted' : 'deducted',
    deletedAt: NOT_DELETED,
    createdAt: now,
    updatedAt: now,
  }
}
