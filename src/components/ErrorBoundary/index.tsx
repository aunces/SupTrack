import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[SupTrack] 渲染异常：', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
          <h1 className="text-lg font-semibold">页面出错了</h1>
          <p className="text-muted-foreground text-sm">{this.state.error.message}</p>
          <button
            className="bg-primary text-primary-foreground mt-4 rounded-md px-4 py-2 text-sm"
            onClick={() => this.setState({ error: null })}
          >
            重试
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
