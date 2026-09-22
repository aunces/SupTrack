import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface ErrorStateProps {
  title?: string
  /** 必须说清「数据还在不在」—— 这个产品的数据只存在本机，用户最怕的就是「丢了」 */
  description?: string
  error?: Error | null
  onRetry?: () => void
  onExport?: () => void
  className?: string
}

/**
 * 错误态（§8.7）。必须给「原因 + 重试」，不能只说「出错了」。
 * 默认文案区分「数据可能丢了」与「数据还在」。
 */
export function ErrorState({
  title = '数据读取失败',
  description = '本地数据库可能被其他标签页占用。你的数据没有丢失。',
  error,
  onRetry,
  onExport,
  className,
}: ErrorStateProps) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col items-start gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>

        <div className="flex items-center gap-2">
          {onRetry ? (
            <Button size="sm" onClick={onRetry}>
              重试
            </Button>
          ) : null}
          {onExport ? (
            <Button size="sm" variant="outline" onClick={onExport}>
              导出备份
            </Button>
          ) : null}
        </div>

        {error ? (
          <details className="text-muted-foreground w-full text-xs">
            <summary className="cursor-pointer">错误详情</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{error.message}</pre>
          </details>
        ) : null}
      </CardContent>
    </Card>
  )
}
