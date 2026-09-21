import type { DailyIntake, DosagePlan, Supplement, TimeSlot } from '@/types'
import { findActivePauses, type ActivePause, type PauseContext } from './pause'
import { isRateConfigValid, matchesRate, nextRateDate } from './rate'

/**
 * 四态与日级状态判定（实施指导书 §6.4）★ 今日页与日历页共用的判定核心。
 *
 * 纯函数：不 import db，输入即数据。
 *
 * 判定优先级（严格按序，第一条命中即返回）：
 *   1. 该日存在 taken=true 的记录  → 'taken'
 *   2. 命中停药                    → 'paused'
 *   3. !matchesRate(plan, date)    → 'rest'
 *   4. 其他                        → 'pending'
 *
 * 为什么「已服用」优先于「停用」：产品的第一问是 Q2「我吃了吗」。
 * 用户已经在停用期点了「仍要服用」，此时显示「停用中」会让他以为没记上。
 * 代价是要在 taken 状态下额外标注来源（offScheduleTake），由 UI 承担。
 */

export type ItemState = 'pending' | 'taken' | 'rest' | 'paused'

export interface DayItem {
  date: string
  supplementId: string
  /** undefined = 补剂已被删除，UI 显示「[已删除的补剂]」 */
  supplement: Supplement | undefined
  /** 计划外记录为空串；UI 据此把它们归入「计划外记录」分组 */
  planId: string
  timeSlot: TimeSlot
  /** 计划量；计划外记录为 0 */
  amountDue: number
  state: ItemState
  /** 该日该补剂的累积已服量（taken=true 的记录之和） */
  takenAmount: number
  /** 该日该补剂的已服时间（最新一条） */
  lastTakenAt: string | null
  /** state === 'rest' 时必填（P2：必须给出下次日期） */
  nextRateDate: string | null
  /** state === 'paused' 或「停用期服用」时非空 */
  pause: ActivePause | null
  /** 有记录且当时处于休息日 / 停用期 */
  offScheduleTake: boolean
  /** 节奏参数非法（R-08） */
  configError: boolean
}

/** 记录分组的键：同一补剂 + 同一时段可能有多条（打卡 + 追加一次） */
function groupKey(supplementId: string, timeSlot: TimeSlot): string {
  return `${supplementId}\u0000${timeSlot}`
}

export function resolveDayItems(input: {
  date: string
  plans: DosagePlan[]
  supplements: Map<string, Supplement>
  /** 该日全部记录 */
  records: DailyIntake[]
  pauseCtx: PauseContext
}): DayItem[] {
  const { date, plans, supplements, records, pauseCtx } = input

  const grouped = new Map<string, DailyIntake[]>()
  for (const record of records) {
    const key = groupKey(record.supplementId, record.timeSlot)
    const list = grouped.get(key)
    if (list) list.push(record)
    else grouped.set(key, [record])
  }

  const out: DayItem[] = []
  const consumed = new Set<string>()

  // 1. 按计划展开：一个计划多个时段 = 多行
  for (const plan of plans) {
    const pauses = findActivePauses(plan.supplementId, date, pauseCtx)
    const pause = pauses.length > 0 ? pauses[0] : null
    const configError = !isRateConfigValid(plan)
    const scheduled = matchesRate(plan, date)

    for (const timeSlot of plan.timeSlots) {
      const key = groupKey(plan.supplementId, timeSlot)
      consumed.add(key)
      const group = grouped.get(key) ?? []
      const takenRecords = group.filter((r) => r.taken)

      let state: ItemState
      if (takenRecords.length > 0) state = 'taken'
      else if (pause) state = 'paused'
      else if (!scheduled) state = 'rest'
      else state = 'pending'

      out.push({
        date,
        supplementId: plan.supplementId,
        supplement: supplements.get(plan.supplementId),
        planId: plan.id,
        timeSlot,
        amountDue: plan.amountPerTime,
        state,
        takenAmount: takenRecords.reduce((sum, r) => sum + r.amount, 0),
        lastTakenAt: latestTakenAt(takenRecords),
        // P2：只有「今天休息」需要给出下次该吃日
        nextRateDate: state === 'rest' ? nextRateDate(plan, date) : null,
        pause,
        offScheduleTake: state === 'taken' && (pause != null || !scheduled),
        configError,
      })
    }
  }

  // 2. 计划外记录补位：planId 为空，或原计划已不存在。
  //    它们不进计划清单，走「计划外」分组（D-13 / §8.1）。
  for (const [key, group] of grouped) {
    if (consumed.has(key)) continue
    const first = group[0]
    const takenRecords = group.filter((r) => r.taken)
    out.push({
      date,
      supplementId: first.supplementId,
      supplement: supplements.get(first.supplementId),
      planId: '',
      timeSlot: first.timeSlot,
      amountDue: 0,
      // 计划外记录只有「已记录」一种正向状态；若只标了漏服，则按未完成处理
      state: takenRecords.length > 0 ? 'taken' : 'pending',
      takenAmount: takenRecords.reduce((sum, r) => sum + r.amount, 0),
      lastTakenAt: latestTakenAt(takenRecords),
      nextRateDate: null,
      pause: null,
      // 计划外服用（含休息日 / 停用期服用）在 UI 上要标注来源
      offScheduleTake: takenRecords.length > 0,
      configError: false,
    })
  }

  return out
}

function latestTakenAt(records: DailyIntake[]): string | null {
  if (records.length === 0) return null
  return records.reduce(
    (latest, r) => (r.createdAt > latest ? r.createdAt : latest),
    records[0].createdAt,
  )
}

export type DayStatus = 'empty' | 'paused' | 'rest' | 'done' | 'partial' | 'missed'

/**
 * 日级状态（日历用）。
 *
 * 「漏服」不存字段、不需要用户手动标记：过去某日存在 state === 'pending' 的应服项，
 * 即自动判为 missed（D-11）。用户显式标记的 taken=false 记录同样使该日落入 missed。
 * 「休息 / 停用」不进完成度分母（P4）。
 */
export function resolveDayStatus(items: DayItem[]): DayStatus {
  const due = items.filter((i) => i.state === 'pending' || i.state === 'taken')
  const paused = items.filter((i) => i.state === 'paused')
  const rest = items.filter((i) => i.state === 'rest')

  if (due.length === 0 && paused.length > 0) return 'paused'
  if (due.length === 0 && rest.length > 0) return 'rest'
  if (due.length === 0) return 'empty'

  const takenCount = due.filter((i) => i.state === 'taken').length
  if (takenCount === due.length) return 'done'
  if (takenCount > 0) return 'partial'
  return 'missed'
}
