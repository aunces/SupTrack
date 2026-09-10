import type { Table } from 'dexie'
import { NOT_DELETED, type DeletedAt } from '@/constants/deletedAt'
import { nowIso } from '@/utils/id'

export interface SoftDeletable {
  id: string
  deletedAt: DeletedAt
}

/**
 * 通用仓储：统一软删除过滤。
 * 读操作默认只返回 deletedAt === 0 的记录，需要回收站时用 trash() / allIncludingDeleted()。
 */
export function createRepository<T extends SoftDeletable>(table: Table<T, string>) {
  return {
    table,

    async all(): Promise<T[]> {
      return table.filter((r) => r.deletedAt === NOT_DELETED).toArray()
    },

    async allIncludingDeleted(): Promise<T[]> {
      return table.toArray()
    },

    /** 回收站：所有已软删除记录，按删除时间倒序 */
    async trash(): Promise<T[]> {
      const rows = await table.filter((r) => r.deletedAt !== NOT_DELETED).toArray()
      return rows.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)))
    },

    async get(id: string): Promise<T | undefined> {
      return table.get(id)
    },

    async getOrThrow(id: string): Promise<T> {
      const row = await table.get(id)
      if (!row) throw new Error(`记录不存在：${id}`)
      return row
    },

    async insert(record: T): Promise<T> {
      await table.add(record)
      return record
    },

    async bulkInsert(records: T[]): Promise<void> {
      await table.bulkAdd(records)
    },

    async update(id: string, patch: Partial<T>): Promise<void> {
      await table.update(id, patch as never)
    },

    async softDelete(id: string): Promise<void> {
      await table.update(id, { deletedAt: nowIso(), updatedAt: nowIso() } as never)
    },

    async restore(id: string): Promise<void> {
      await table.update(id, { deletedAt: NOT_DELETED, updatedAt: nowIso() } as never)
    },

    async purge(id: string): Promise<void> {
      await table.delete(id)
    },
  }
}

export type Repository<T extends SoftDeletable> = ReturnType<typeof createRepository<T>>
