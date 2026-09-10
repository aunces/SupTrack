const CHANNEL_NAME = 'suptrack-data-change'

let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME)
  return channel
}

/** 写操作后调用，通知其它标签页 */
export function publishDataChange(): void {
  getChannel()?.postMessage({ type: 'changed' })
}

export function subscribeDataChange(handler: () => void): void {
  const ch = getChannel()
  if (!ch) return
  ch.onmessage = () => handler()
}
