import { NOT_DELETED } from '@/constants/deletedAt'

type Record = { id: string; updatedAt?: string; deletedAt: number | string }

/**
 * 导入合并（需求 5.7）：
 * - 时间不同取较新者
 * - 时间相同：DailyIntake 取 local（涉及库存副作用），其他表取删除意图优先
 */
export function mergeRecord<T extends Record>(
  local: T | undefined,
  incoming: T,
  tableName: string,
): T {
  if (!local) return incoming

  const localTime = new Date(local.updatedAt ?? 0).getTime()
  const incomingTime = new Date(incoming.updatedAt ?? 0).getTime()
  if (incomingTime !== localTime) {
    return incomingTime > localTime ? incoming : local
  }

  if (tableName === 'dailyIntakes') return local

  if (local.deletedAt !== NOT_DELETED && incoming.deletedAt === NOT_DELETED) return local
  if (incoming.deletedAt !== NOT_DELETED && local.deletedAt === NOT_DELETED) return incoming
  return local
}
