import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

/**
 * 断网提示条（§8.7）。
 * **不阻塞、不弹窗、不遮罩**：这个应用本来就完全离线可用，断网只是提示一句。
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  )
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const goOffline = () => {
      setOffline(true)
      setDismissed(false)
    }
    const goOnline = () => setOffline(false)

    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!offline || dismissed) return null

  return (
    <Alert className="mb-4 items-center">
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>未联网 · 功能不受影响，数据仍存在本机</span>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="关闭提示"
          onClick={() => setDismissed(true)}
        >
          <X />
        </Button>
      </AlertDescription>
    </Alert>
  )
}
