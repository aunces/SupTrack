import { ALL_SUPPLEMENTS } from '@/constants/enums'
import type { PausePeriod, PauseScheme } from '@/types'
import { addDays, diffCalendarDays, isValidDate } from './date'

/**
 * 停药判定（实施指导书 §6.3）★ 逻辑核心。
 *
 * 纯函数：不 import db，输入即数据。
 *
 * 两种停药来源，取**并集**：
 *   1. 区间停药：一条有起止的暂停（临时停药 / 方案组里「独立起止」的条目）
 *   2. 周期停药（D-44）：方案组处于「吃 N 停 M」的**停用段**
 *
 * ★ 周期是**单向**的 —— 它只在停用段产出 `paused`，「吃」段完全不参与判定，
 *   直接让位给 utils/rate.ts 的节奏引擎。这是「不重现 v11.1 那个旧 bug」的关键：
 *   旧实现把周期挂在停药条目上，导致用户设的「隔天吃」被渲染成「停药中」。
 *   现在周期只属于「用户显式建好并执行了的具名疗程」，从不表达「该吃」。
 */

export interface PauseContext {
  periods: PausePeriod[]
  /** schemeId → scheme */
  schemes: Map<string, PauseScheme>
}

export interface ActivePause {
  period: PausePeriod
  scheme: PauseScheme | null
  /** 今日页文案用：优先 period.reason，其次 scheme.name，最后 '停药中' */
  reasonLabel: string
  /** 停用区间（闭区间） */
  startDate: string
  /** null = 持续中 */
  endDate: string | null
  /** 恢复服用日。区间停药 = endDate + 1（DIFF-05）；周期停药 = 下一个「吃」段首日 */
  resumeDate: string | null
}

// ── 周期（D-44） ───────────────────────────────────────────────

interface CycleParams {
  on: number
  off: number
  /** 周期第 1 天 = 方案组的执行日 */
  anchor: string
}

/**
 * 「吃几天 / 停几天」有没有配齐。**不看是否已执行** ——
 * 未执行的方案组照样可以把周期配好，停药页要能把「吃 21 停 7」显示出来。
 */
function cycleLengths(scheme: PauseScheme): { on: number; off: number } | null {
  if (scheme.cycleMode !== 'cyclic') return null
  const { cycleOnDays: on, cycleOffDays: off } = scheme
  if (on == null || on < 1 || off == null || off < 1) return null
  return { on, off }
}

/**
 * 能算「具体某一天是不是停用段」的完整参数 —— 额外要求**已执行**（有起点）。
 * 失败方向与 R3 / R-08 一致：一律返回 null，由调用方按「不是停用段」处理，
 * 绝不静默隐藏补剂。
 */
function cycleParams(scheme: PauseScheme): CycleParams | null {
  const lengths = cycleLengths(scheme)
  if (!lengths) return null
  const anchor = scheme.activatedAt
  if (!anchor || !isValidDate(anchor)) return null
  return { ...lengths, anchor }
}

/** 是否配成了周期方案（与是否已执行无关，停药页据此显示「吃 N 停 M」） */
export function isCyclicScheme(scheme: PauseScheme): boolean {
  return cycleLengths(scheme) != null
}

/** 用户语言描述周期（与 rate.ts::describeRate 同一套说法） */
export function describeSchemeCycle(scheme: PauseScheme): string | null {
  const lengths = cycleLengths(scheme)
  if (!lengths) return null
  if (lengths.on === 1 && lengths.off === 1) return '隔天'
  if (lengths.on === 1) return `每 ${lengths.off + 1} 天一次`
  return `吃 ${lengths.on} 停 ${lengths.off}`
}

/**
 * 该日是否处于周期的**停用段**（第 on+1 ~ on+off 天）。
 * 区间外（执行日之前 / endedAt 之后）一律 false —— 那时整条方案都不生效。
 */
export function isCyclicSchemeOffDay(scheme: PauseScheme, date: string): boolean {
  const params = cycleParams(scheme)
  if (!params) return false
  if (scheme.endedAt != null && date > scheme.endedAt) return false
  const diff = diffCalendarDays(params.anchor, date)
  if (diff < 0) return false
  return diff % (params.on + params.off) >= params.on
}

/** 周期内的第几天（停药页展示「第 22/28 天」）。未执行 / 执行日之前 → null */
export function cyclicProgress(
  scheme: PauseScheme,
  date: string,
): { day: number; total: number; offDay: boolean } | null {
  const params = cycleParams(scheme)
  if (!params) return null
  const total = params.on + params.off
  const diff = diffCalendarDays(params.anchor, date)
  if (diff < 0) return null
  return { day: (diff % total) + 1, total, offDay: isCyclicSchemeOffDay(scheme, date) }
}

/** 严格晚于 fromDate 的第一个「停用段」日（停药页提示「X 起停 7 天」） */
export function nextCyclicOffDay(scheme: PauseScheme, fromDate: string): string | null {
  const params = cycleParams(scheme)
  if (!params) return null
  const total = params.on + params.off
  // 一个周期内必有解，最多找 total 天
  for (let i = 1; i <= total; i++) {
    const day = addDays(fromDate, i)
    if (isCyclicSchemeOffDay(scheme, day)) return day
  }
  return null
}

/** 严格晚于 fromDate 的第一个「吃段」首日 = 恢复服用日 */
export function nextCyclicOnDay(scheme: PauseScheme, fromDate: string): string | null {
  const params = cycleParams(scheme)
  if (!params) return null
  const total = params.on + params.off
  for (let i = 1; i <= total; i++) {
    const day = addDays(fromDate, i)
    if (!isCyclicSchemeOffDay(scheme, day)) return day
  }
  return null
}

// ── 区间 ───────────────────────────────────────────────────────

/**
 * 解析一条停药条目的实际生效区间。
 * 返回 null 表示该条目当前不生效（方案组未执行过、schemeId 指向的组已不存在等）。
 */
export function resolveEffectiveRange(
  period: PausePeriod,
  scheme: PauseScheme | null,
): { startDate: string; endDate: string | null } | null {
  // 条目自带 startDate → 用条目自己的（独立起止）
  if (period.startDate) {
    return { startDate: period.startDate, endDate: period.endDate ?? null }
  }
  // 否则跟随方案组
  if (!scheme) return null // 临时停药必须有 startDate（Zod 强制）
  if (scheme.activatedAt == null) return null // 从未执行 → 不生效
  return { startDate: scheme.activatedAt, endDate: period.endDate ?? scheme.endedAt ?? null }
}

/** 该日是否落在某条停药区间内（含边界） */
export function coversDate(
  range: { startDate: string; endDate: string | null },
  date: string,
): boolean {
  if (date < range.startDate) return false
  if (range.endDate != null && date > range.endDate) return false
  return true
}

/** 补剂在该日命中的全部停药条目（并集语义：补剂级与全局任一命中即停用） */
export function findActivePauses(
  supplementId: string,
  date: string,
  ctx: PauseContext,
): ActivePause[] {
  const out: ActivePause[] = []
  for (const period of ctx.periods) {
    if (period.supplementId !== supplementId && period.supplementId !== ALL_SUPPLEMENTS) continue
    const scheme = period.schemeId ? (ctx.schemes.get(period.schemeId) ?? null) : null

    // ★ 周期方案（D-44）：只作用于「跟随方案」的条目 —— 带自己 startDate 的条目是
    //   「独立起止」，与周期无关。跟随条目在**吃段**要整个让位给节奏引擎，不产出停用。
    const followsScheme = period.startDate == null
    const cyclicOff = followsScheme && scheme != null && isCyclicSchemeOffDay(scheme, date)
    if (followsScheme && scheme != null && isCyclicScheme(scheme) && !cyclicOff) continue

    const range = resolveEffectiveRange(period, scheme)
    if (!range || !coversDate(range, date)) continue

    out.push({
      period,
      scheme,
      reasonLabel: period.reason ?? scheme?.name ?? '停药中',
      startDate: range.startDate,
      endDate: range.endDate,
      // 周期停用段的恢复日 = 下一个吃段首日，而不是 endDate + 1
      resumeDate:
        cyclicOff && scheme
          ? nextCyclicOnDay(scheme, date)
          : range.endDate
            ? addDays(range.endDate, 1)
            : null,
    })
  }
  return out
}

export function isPausedOn(supplementId: string, date: string, ctx: PauseContext): boolean {
  return findActivePauses(supplementId, date, ctx).length > 0
}
