import { LOW_STOCK_DAYS } from '@/constants/enums'
import type { DosagePlan, Supplement } from '@/types'
import { rateDensity } from './rate'

/**
 * 余量规则（实施指导书 §6.5）★ 单一数字，D1=B。
 *
 * 不做流水、不做批次、不做状态机、不做「为什么少了 3 粒」的追溯（R-05）。
 * 纯函数：不 import db。
 */

/**
 * 平均每日消耗量 = Σ(amountPerTime × rateDensity(plan))，仅计启用计划。
 *
 * 为什么用「日均」而不是「每次量」：线框 W-02 写的是「剩余 ÷ 每次量」，
 * 但在 cyclic 计划下这会让隔天吃的补剂被高估一倍消耗。
 * 用「每次量 × 出现率」的平均值才能算出正确的「还能吃几天」。
 */
export function dailyDose(supplementId: string, plans: DosagePlan[]): number {
  return plans
    .filter((plan) => plan.supplementId === supplementId && plan.isActive)
    .reduce((sum, plan) => sum + plan.amountPerTime * rateDensity(plan), 0)
}

/** 余量偏低：剩余 ÷ 日均消耗 ≤ 5 天（写死不配置） */
export function isLowStock(supplement: Supplement, plans: DosagePlan[]): boolean {
  if (supplement.stockCount == null) return false
  // 负值走「库存为负」提示，不重复提示
  if (supplement.stockCount < 0) return false
  const dose = dailyDose(supplement.id, plans)
  if (dose <= 0) return false
  return supplement.stockCount / dose <= LOW_STOCK_DAYS
}

/** 库存为负：允许为负、不拦截，但要提示（§6.5） */
export function isNegativeStock(supplement: Supplement): boolean {
  return supplement.stockCount != null && supplement.stockCount < 0
}

/** 剩余可用天数（日均消耗为 0 或余量未记录时为 null） */
export function stockDaysLeft(supplement: Supplement, plans: DosagePlan[]): number | null {
  if (supplement.stockCount == null) return null
  const dose = dailyDose(supplement.id, plans)
  if (dose <= 0) return null
  return supplement.stockCount / dose
}
