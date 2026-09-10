import { MISSED_PLAN_CACHE_MS } from '@/constants/enums'
import type { MissedPlan } from '@/types'

interface CacheEntry {
  data: MissedPlan[]
  ts: number
}

let cache: CacheEntry | null = null

export function getMissedCache(): MissedPlan[] | null {
  if (!cache) return null
  if (Date.now() - cache.ts >= MISSED_PLAN_CACHE_MS) return null
  return cache.data
}

export function setMissedCache(data: MissedPlan[]): void {
  cache = { data, ts: Date.now() }
}

/** 软删除 / 恢复 DailyIntake 后主动失效，不等 5 分钟 */
export function invalidateMissedCache(): void {
  cache = null
}
