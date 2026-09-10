import { db } from '@/db'
import type { MetaRecord } from '@/types'

/** Meta 为 key-value 配置表，无 deletedAt */
export const metaRepository = {
  async get<T = unknown>(key: string): Promise<T | undefined> {
    const row = await db.meta.get(key)
    return row?.value as T | undefined
  },

  async set(key: string, value: unknown): Promise<void> {
    await db.meta.put({ key, value })
  },

  async remove(key: string): Promise<void> {
    await db.meta.delete(key)
  },

  async all(): Promise<MetaRecord[]> {
    return db.meta.toArray()
  },
}
