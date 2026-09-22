import type { ReactNode } from 'react'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { cn } from 'cn'

interface EmptyStateProps {
  title: string
  description?: string
  /** 主操作或次要操作，由调用方决定强度 */
  action?: ReactNode
  icon?: ReactNode
  className?: string
}

/**
 * 空状态（§8.7）。**三种场景文案不同，不可共用**：
 * 首次使用 / 全部关闭 / 筛选无结果 —— 具体文案由各页面传入，这里只提供结构。
 */
export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <Empty className={cn('border', className)}>
      <EmptyHeader>
        {icon ? <EmptyMedia variant="icon">{icon}</EmptyMedia> : null}
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  )
}
