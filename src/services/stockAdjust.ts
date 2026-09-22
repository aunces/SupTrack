import { db } from '@/db'
import { nowIso } from '@/utils/id'

/**
 * 余量联动的唯一入口（实施指导书 §6.5）。
 *
 * 打卡、追加、补录、撤销、改量全部走这一个函数，保证「扣」与「还」的算法永远对称 ——
 * 曾经有两份各自实现的加减法，撤销时少加一次都很难被发现。
 *
 * 规则：
 * - `stockCount == null` 表示「不记录余量」，直接跳过（该补剂永不参与余量逻辑）
 * - 允许为负，不拦截、不夹取 —— 用户少记一次补货就应该是负数，改一下就好
 */

export async function applyStockDelta(supplementId: string, delta: number): Promise<void> {
  if (delta === 0) return
  const supplement = await db.supplements.get(supplementId)
  if (!supplement || supplement.stockCount == null) return
  await db.supplements.update(supplementId, {
    stockCount: supplement.stockCount + delta,
    updatedAt: nowIso(),
  })
}
