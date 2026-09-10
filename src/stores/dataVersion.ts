import { create } from 'zustand'
import { subscribeDataChange } from '@/utils/broadcast'

interface DataVersionState {
  version: number
  bump: () => void
}

/**
 * 跨标签页一致性：收到广播后自增，useLiveQuery 依赖该计数器重新查询。
 * 同标签页更新由 Dexie 自身的 liveQuery 负责，无需手动 invalidate。
 */
export const useDataVersion = create<DataVersionState>((set) => ({
  version: 0,
  bump: () => set((state) => ({ version: state.version + 1 })),
}))

subscribeDataChange(() => useDataVersion.getState().bump())
