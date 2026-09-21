import type { RateMode } from '@/constants/enums'
import type { DosagePlan } from '@/types'
import { addDays, diffCalendarDays, isValidDate } from './date'

/**
 * 节奏判定（实施指导书 §6.2）★ 逻辑核心。
 *
 * 纯函数：不 import db，输入即数据。
 * 失败方向统一为「不隐藏」（R-08）：节奏参数缺失或非法时判为「该吃」，
 * 由管理页标「配置异常」提示用户修正，绝不允许静默隐藏补剂。
 */

/** 判断某日是否为该计划的「该吃日」 */
export function matchesRate(plan: DosagePlan, date: string): boolean {
  if (plan.rateMode === 'daily') return true

  // cyclic：参数缺失 / 非法 → 判为「该吃」（R-08）
  const { rateOnDays: on, rateOffDays: off, rateAnchorDate: anchor } = plan
  if (!anchor || on == null || off == null || on < 1 || off < 1 || !isValidDate(anchor)) {
    return true
  }

  const diff = diffCalendarDays(anchor, date)
  // 节奏尚未开始 → 该日不出现（不是错误）
  if (diff < 0) return false
  // anchor 当天算周期第 1 个「该吃」日
  return diff % (on + off) < on
}

/** 严格晚于 fromDate 的第一个「该吃」日。用于 P2「下次 X 日」 */
export function nextRateDate(plan: DosagePlan, fromDate: string): string | null {
  if (plan.rateMode === 'daily') return addDays(fromDate, 1)
  const { rateOnDays: on, rateOffDays: off, rateAnchorDate: anchor } = plan
  // 配置异常按每天算（失败方向同上）
  if (!anchor || on == null || off == null) return addDays(fromDate, 1)

  const period = on + off
  // 一个周期内必有解，最多找 period 天
  for (let i = 1; i <= period; i++) {
    const d = addDays(fromDate, i)
    if (matchesRate(plan, d)) return d
  }
  return null
}

/** 平均每日出现率（0–1]。用于余量估算：隔天吃的补剂不能按「每次量」算日均 */
export function rateDensity(plan: DosagePlan): number {
  if (plan.rateMode === 'daily') return 1
  const { rateOnDays: on, rateOffDays: off } = plan
  if (on == null || off == null || on + off === 0) return 1
  return on / (on + off)
}

/** 用户语言描述节奏（列表直接用这个，不要把参数暴露给用户） */
export function describeRate(plan: DosagePlan): string {
  if (plan.rateMode === 'daily') return '每天'
  const { rateOnDays: on, rateOffDays: off } = plan
  if (on == null || off == null) return '配置异常'
  if (on === 1 && off === 1) return '隔天'
  if (on === 1) return `每 ${off + 1} 天一次`
  return `吃 ${on} 停 ${off}`
}

/** cyclic 参数是否完整合法（用于补剂页「配置异常」标记，R-08） */
export function isRateConfigValid(plan: DosagePlan): boolean {
  if (plan.rateMode === 'daily') return true
  const { rateOnDays: on, rateOffDays: off, rateAnchorDate: a } = plan
  return on != null && off != null && on >= 1 && off >= 1 && !!a && isValidDate(a)
}

/** UI 预设 → 参数 */
export interface RateParams {
  rateMode: RateMode
  rateOnDays: number | null
  rateOffDays: number | null
  rateAnchorDate: string | null
}

export interface RatePreset {
  key: string
  label: string
  /**
   * anchor 必传（起点，默认今天）。
   * n、m 的含义随预设而变：「每 N 天一次」用 n；「吃 N 停 M」用 n 与 m。
   */
  toParams: (anchor: string, n?: number, m?: number) => RateParams
}

export const RATE_PRESETS: readonly RatePreset[] = [
  {
    key: 'daily',
    label: '每天',
    toParams: () => ({
      rateMode: 'daily',
      rateOnDays: null,
      rateOffDays: null,
      rateAnchorDate: null,
    }),
  },
  {
    key: 'everyOther',
    label: '隔天',
    toParams: (a) => ({ rateMode: 'cyclic', rateOnDays: 1, rateOffDays: 1, rateAnchorDate: a }),
  },
  {
    key: 'everyN',
    label: '每 N 天一次',
    toParams: (a, n = 2) => ({
      rateMode: 'cyclic',
      rateOnDays: 1,
      rateOffDays: n - 1,
      rateAnchorDate: a,
    }),
  },
  {
    key: 'onOff',
    label: '吃 N 停 M',
    toParams: (a, on = 5, off = 2) => ({
      rateMode: 'cyclic',
      rateOnDays: on,
      rateOffDays: off,
      rateAnchorDate: a,
    }),
  },
]
