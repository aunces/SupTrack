import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { stopScheme } from '@/services/pauseService'
import { toast } from '@/stores/toastStore'
import type { PauseScheme } from '@/types'
import { formatShortDate, today } from '@/utils/date'

/**
 * 今日页顶部停药提醒条（§8.3 / T-208）。
 *
 * 只在**存在执行中的方案组**时渲染 —— 临时停药不出现，因为它本来就会在
 * 对应的补剂行上显示「停用中」，顶部再提醒一次是噪音。
 * 方案组不一样：它一次覆盖多项，用户需要知道「为什么今天少了一半」。
 *
 * **W-03：点空白区不跳转。** 整条不是链接、没有整行点击 ——
 * 这里的唯一动作是「停止」，旁边就有一个明确的按钮。
 * 把它做成链接会让「想停止」的用户先跳走再找回来。
 */

interface PauseSchemeBannerProps {
  scheme: PauseScheme
  entryCount: number
}

export function PauseSchemeBanner({ scheme, entryCount }: PauseSchemeBannerProps) {
  const [stopping, setStopping] = useState(false)

  async function handleStop() {
    setStopping(true)
    try {
      await stopScheme(scheme.id, today())
      toast(`已停止「${scheme.name}」`)
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    } finally {
      setStopping(false)
    }
  }

  return (
    <section className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          当前停药方案：{scheme.name}（{entryCount} 项）
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {scheme.activatedAt ? `${formatShortDate(scheme.activatedAt)} 起` : '已执行'}
          {scheme.endedAt ? ` · ${formatShortDate(scheme.endedAt)} 已结束` : ' · 未设结束日'}
        </p>
      </div>
      <Button size="sm" variant="outline" disabled={stopping} onClick={handleStop}>
        {stopping ? '停止中…' : '停止'}
      </Button>
    </section>
  )
}

export default PauseSchemeBanner
