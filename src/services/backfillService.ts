import { INTAKE_ORIGIN, type TimeSlot } from '@/constants/enums'
import { db } from '@/db'
import {
  dailyIntakeRepository,
  dosagePlanRepository,
  pausePeriodRepository,
  pauseSchemeRepository,
  supplementRepository,
} from '@/repositories'
import { parseOrThrow } from '@/schemas/common'
import { DailyIntakeCreateSchema } from '@/schemas/dailyIntake'
import type { DailyIntake } from '@/types'
import { publishDataChange } from '@/utils/broadcast'
import { backfillRange } from '@/utils/date'
import { resolveDayItems, type DayItem, type ItemState } from '@/utils/dayState'
import { buildIntake } from '@/utils/intakeFactory'
import { applyStockDelta } from './stockAdjust'

/**
 * 补录用例（实施指导书 §7.5 / §4.7）。
 *
 * 三条不可协商的规则：
 * 1. **窗口固定 7 天、不含今天**（D-07）。今天的事走今日页打卡，不该有第二条路径。
 * 2. **休息日 / 停用日不可补录**。UI 不给入口，service 这里再拦一次 ——
 *    入口是体验，校验是正确性，两者不能互相替代。
 * 3. 漏服也是**一条记录**（`taken=false`）。不存「漏服」字段、不往计划上写字，
 *    日级状态由 `resolveDayStatus` 现算（§6.4）。所以补录是这个产品里唯一
 *    会写入 taken=false 的路径，也是「过去的漏服」被固化的方式。
 *
 * 可补录项的口径**完全复用** `resolveDayItems`：判定只写一份，UI 列的和服务层认的
 * 必然是同一批（否则会出现「列表里有、点下去说不能补录」）。
 */

export { backfillRange }

/** 窗口内可补录（`taken=false` 即标漏服） */
export interface BackfillInput {
  date: string
  supplementId: string
  timeSlot: TimeSlot
  amount: number
  /** true = 已服用（扣余量）；false = 标记漏服（不扣余量） */
  taken: boolean
}

/** UI 用 error.message 直接展示，所以文案就是用户语言 */
export class BackfillNotAllowedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackfillNotAllowedError'
  }
}

function assertInWindow(date: string): void {
  const { min, max } = backfillRange()
  if (date > max) throw new BackfillNotAllowedError('补录不能选择今天或未来')
  if (date < min) throw new BackfillNotAllowedError('补录窗口为最近 7 天')
}

interface DayContext {
  items: DayItem[]
  /** 该日所有记录（含 taken=false），用于判断「是否已有记录」 */
  records: DailyIntake[]
}

async function loadDayContext(date: string): Promise<DayContext> {
  const [plans, records, supplements, periods, schemes] = await Promise.all([
    dosagePlanRepository.listActive(),
    dailyIntakeRepository.listByDate(date),
    supplementRepository.all(),
    pausePeriodRepository.all(),
    pauseSchemeRepository.all(),
  ])

  const items = resolveDayItems({
    date,
    plans,
    supplements: new Map(supplements.map((s) => [s.id, s])),
    records,
    pauseCtx: { periods, schemes: new Map(schemes.map((s) => [s.id, s])) },
  })

  return { items, records }
}

function groupKey(supplementId: string, timeSlot: TimeSlot): string {
  return `${supplementId}\u0000${timeSlot}`
}

/**
 * 某日可补录的应服项。
 * 已排掉：休息日 / 停用日 / 该补剂尚未开始 / 已有任何记录的项（含已标漏服的）。
 */
export async function listBackfillableItems(date: string): Promise<DayItem[]> {
  const { min, max } = backfillRange()
  // 窗口外的日期直接返回空 —— 日历页据此把入口换成「超出补录窗口」（§8.4）
  if (date < min || date > max) return []

  const { items, records } = await loadDayContext(date)
  const recorded = new Set(records.map((r) => groupKey(r.supplementId, r.timeSlot)))

  return items.filter(
    (item) => item.state === 'pending' && !recorded.has(groupKey(item.supplementId, item.timeSlot)),
  )
}

/** 把「为什么不能补」说清楚 —— 日历页与 Dialog 都会直接展示这句话 */
function explain(item: DayItem | undefined, state: ItemState | null, hasRecord: boolean): string {
  if (!item) return '该日没有这个补剂的应服项'
  if (hasRecord) return '该日已有记录，无需补录'
  if (state === 'paused') return '该日该补剂处于停用中，不能补录'
  if (state === 'rest') return '该日是休息日，不能补录'
  return '该日没有这个补剂的应服项'
}

/**
 * 单条补录。
 *
 * `taken=true` 扣余量，`taken=false` 不扣 —— 漏服意味着药没出瓶，余量不该少。
 * 余量改动与记录写入在同一事务内（§6.5）。
 */
export async function backfillOne(input: BackfillInput): Promise<DailyIntake> {
  assertInWindow(input.date)

  const { items, records } = await loadDayContext(input.date)
  const key = groupKey(input.supplementId, input.timeSlot)
  const item = items.find((i) => groupKey(i.supplementId, i.timeSlot) === key)
  const hasRecord = records.some((r) => groupKey(r.supplementId, r.timeSlot) === key)

  if (!item || hasRecord || item.state !== 'pending') {
    throw new BackfillNotAllowedError(explain(item, item?.state ?? null, hasRecord))
  }

  const record = parseOrThrow(
    DailyIntakeCreateSchema,
    buildIntake({
      date: input.date,
      supplementId: input.supplementId,
      // 记录仍挂在计划上，回看时才能显示「本应服用多少」
      planId: item.planId || null,
      timeSlot: input.timeSlot,
      amount: input.amount,
      taken: input.taken,
      origin: INTAKE_ORIGIN.BACKFILL,
      notes: null,
    }),
  )

  await db.transaction('rw', db.dailyIntakes, db.supplements, async () => {
    await db.dailyIntakes.add(record)
    if (record.taken) await applyStockDelta(record.supplementId, -record.amount)
  })

  publishDataChange()
  return record
}
