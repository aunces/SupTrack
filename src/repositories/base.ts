import type { Table } from 'dexie'

/**
 * 通用仓储：表级 CRUD，不含任何业务规则。
 *
 * 已去掉软删除（D2=A / R-04）：没有 softDelete / restore / trash / purge，
 * 删除就是真的删除，一把 remove。仓储也不判断「能不能删」——那是 service 的事。
 */
export function createRepository<T extends { id: string }>(table: Table<T, string>) {
  return {
    table,

    async all(): Promise<T[]> {
      return table.toArray()
    },

    async count(): Promise<number> {
      return table.count()
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

    async remove(id: string): Promise<void> {
      await table.delete(id)
    },

    async clear(): Promise<void> {
      await table.clear()
    },
  }
}

export type Repository<T extends { id: string }> = ReturnType<typeof createRepository<T>>
