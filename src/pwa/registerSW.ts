/**
 * PWA 更新策略：新版本就绪时不静默刷新，由用户确认后再接管并刷新，
 * 避免打卡过程中被中断；Schema 迁移只在新版本代码接管后执行。
 */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').then((registration) => {
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            const confirmed = window.confirm('新版本已就绪，是否立即刷新？')
            if (!confirmed) return
            installing.postMessage('SKIP_WAITING')
            window.location.reload()
          }
        })
      })
    })
  })
}
