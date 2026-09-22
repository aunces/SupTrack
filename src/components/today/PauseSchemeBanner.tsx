import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { stopScheme } from '@/services/pauseService'
import { toast } from '@/stores/toastStore'
import type { PauseScheme } from '@/types'
import { today } from '@/utils/date'

/**
 * 今日页的停药提醒条（设计稿首页 ② / §8.3）。
 *
 * 只在**存在执行中的方案组**时渲染 —— 临时停药不出现，因为它本来就会在
 * 对应的补剂卡片上显示「停用中」，顶部再提醒一次是噪音。
 * 方案组不一样：它一次覆盖多项，用户需要知道「为什么今天少了一半」。
 *
 * 样式：浅蓝底 #F8FAFC + 圆角 8 + 左侧 3px 紫色竖条；
 * 文案单行（起止细节在停药页，这里只说「是什么、几项、能停」）。
 *
 * **W-03：点空白区不跳转。** 整条不是链接、没有整行点击 ——
 * 唯一的动作是右边的「停止」。做成链接会让「想停止」的用户先跳走再找回来。
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
    <section className="bg-slate-50 flex min-h-[38px] flex-1 items-stretch overflow-hidden rounded-lg">
      <span className="w-[3px] shrink-0 bg-[#8B5CF6]" aria-hidden />
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3.5">
        <p className="truncate text-xs">
          当前停药方案：{scheme.name}（{entryCount} 项）
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-[30px] shrink-0 rounded-[6px] px-3 text-xs"
          disabled={stopping}
          onClick={handleStop}
        >
          {stopping ? '停止中…' : '停止'}
        </Button>
      </div>
    </section>
  )
}

export default PauseSchemeBanner
