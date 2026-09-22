import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { exportToFile } from '@/services/importExportService'
import { metaService } from '@/services/metaService'
import { toast } from '@/stores/toastStore'

/**
 * 备份提醒（T-307）。
 *
 * 这个产品的数据**只存在这一台机器的这个浏览器里**，没有第二份。
 * 所以「多久没备份」必须能被看见，而不是藏在设置页里等用户想起来。
 *
 * 两种都提醒：距上次导出 > 30 天，以及**从未导出过**。
 * 关闭只对本次会话有效（sessionStorage）—— 提醒的作用就是别忘了；
 * 如果关掉就永久消失，那它等于没有。真的导出过之后它自然不再出现。
 */

const DISMISS_KEY = 'suptrack:backupRemindDismissed'

export function BackupRemindBanner() {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1')
  const [busy, setBusy] = useState(false)

  // 判定全部来自 metaService.needsBackupRemind（>30 天 或 从未导出），页面不重算
  const needsRemind = useLiveQuery(() => metaService.needsBackupRemind(), [], undefined)
  const lastExportAt = useLiveQuery(() => metaService.getLastExportAt(), [], undefined)

  if (dismissed || needsRemind !== true) return null

  async function handleExport() {
    setBusy(true)
    try {
      await exportToFile()
      toast('已导出备份')
      // 导出后 needsBackupRemind 变 false，本组件随 meta 变化自动消失
    } catch (error) {
      toast((error as Error).message, { variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
      <p className="text-sm">
        {lastExportAt ? '距上次导出已超过 30 天。' : '还没有导出过备份。'}
        <span className="text-muted-foreground">数据只存在本机浏览器，建议现在导出一份。</span>
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleExport()}>
          {busy ? '导出中…' : '导出备份'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, '1')
            setDismissed(true)
          }}
        >
          关闭
        </Button>
      </div>
    </section>
  )
}

export default BackupRemindBanner
