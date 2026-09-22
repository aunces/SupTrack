import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { exportToFile } from '@/services/importExportService'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * 错误边界（§8.8）。
 * 捕获渲染错误后显示错误态卡而不是白屏，并给两个动作：
 * [重新加载] 与 [导出备份] —— 万一真坏了，用户至少能把数据抢救出来。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[SupTrack] 渲染异常：', error, info.componentStack)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleExport = () => {
    void exportToFile().catch((error: unknown) => {
      console.error('[SupTrack] 导出失败：', error)
    })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <Card className="w-full max-w-lg">
          <CardContent className="flex flex-col items-start gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">页面出错了</p>
              <p className="text-muted-foreground text-sm">
                本地数据可能受影响。你的数据没有丢失，可以先导出备份再刷新页面。
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={this.handleReload}>
                重新加载
              </Button>
              <Button size="sm" variant="outline" onClick={this.handleExport}>
                导出备份
              </Button>
            </div>

            <details className="text-muted-foreground w-full text-xs">
              <summary className="cursor-pointer">错误详情</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
                {this.state.error.message}
              </pre>
            </details>
          </CardContent>
        </Card>
      </div>
    )
  }
}

export default ErrorBoundary
