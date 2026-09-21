import { ALL_SUPPLEMENTS } from '@/constants/enums'
import type { PausePeriod, PauseScheme } from '@/types'
import { addDays } from './date'

/**
 * 停药判定（实施指导书 §6.3）★ 逻辑核心。
 *
 * 纯函数：不 import db，输入即数据。
 * 已删除 cycleMode 相关分支：节奏搬到计划上，停药期收窄为「一段有起止的暂停」。
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
  /** 恢复服用日 = endDate + 1；null = 持续中（DIFF-05） */
  resumeDate: string | null
}

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
    const range = resolveEffectiveRange(period, scheme)
    if (!range || !coversDate(range, date)) continue
    out.push({
      period,
      scheme,
      reasonLabel: period.reason ?? scheme?.name ?? '停药中',
      startDate: range.startDate,
      endDate: range.endDate,
      resumeDate: range.endDate ? addDays(range.endDate, 1) : null,
    })
  }
  return out
}

export function isPausedOn(supplementId: string, date: string, ctx: PauseContext): boolean {
  return findActivePauses(supplementId, date, ctx).length > 0
}
