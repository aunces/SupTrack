import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from 'cn'

/** D-14：加载超过 300ms 才显示骨架屏 —— 数据快时闪一下反而更烦 */
const DEFAULT_DELAY_MS = 300

interface LoadingSkeletonProps {
  lines?: number
  delayMs?: number
  className?: string
}

/**
 * 骨架屏（§8.7）。**不用 spinner**：保留页面结构感，避免闪白屏。
 * 组件自己管「延迟出现」，页面只管在 loading 时渲染它。
 */
export function LoadingSkeleton({
  lines = 3,
  delayMs = DEFAULT_DELAY_MS,
  className,
}: LoadingSkeletonProps) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs])

  if (!show) return null

  return (
    <div
      data-slot="loading-skeleton"
      className={cn('flex flex-col gap-3', className)}
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  )
}
