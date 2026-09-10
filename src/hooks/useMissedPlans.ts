import { useCallback, useEffect, useState } from 'react'
import { detectMissedPlans } from '@/services/backfillService'
import type { MissedPlan } from '@/types'
import { getMissedCache, invalidateMissedCache, setMissedCache } from '@/utils/missedCache'

/**
 * 次日提醒：进入首页时检测，结果缓存 5 分钟；
 * 软删除 / 恢复记录后调用 invalidate() 立即重算。
 */
export function useMissedPlans() {
  const [missed, setMissed] = useState<MissedPlan[]>(() => getMissedCache() ?? [])
  const [loading, setLoading] = useState(() => getMissedCache() === null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    const cached = getMissedCache()
    if (cached) {
      setMissed(cached)
      setLoading(false)
      return
    }

    setLoading(true)
    detectMissedPlans()
      .then((data) => {
        setMissedCache(data)
        if (!cancelled) {
          setMissed(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [version])

  const invalidate = useCallback(() => {
    invalidateMissedCache()
    setVersion((v) => v + 1)
  }, [])

  return { missed, loading, invalidate }
}
