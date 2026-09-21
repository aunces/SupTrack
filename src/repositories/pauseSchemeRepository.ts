import { db } from '@/db'
import { PauseSchemeCreateSchema, PauseSchemeUpdateSchema } from '@/schemas/pauseScheme'
import type { PauseSchemeCreateInput, PauseSchemeUpdateInput } from '@/schemas/pauseScheme'
import type { PauseScheme } from '@/types'
import { nowIso } from '@/utils/id'
import { createRepository } from './base'

const base = createRepository<PauseScheme>(db.pauseSchemes)

export const pauseSchemeRepository = {
  ...base,

  async create(input: PauseSchemeCreateInput): Promise<PauseScheme> {
    const record = PauseSchemeCreateSchema.parse(input) as PauseScheme
    return base.insert(record)
  },

  async update(id: string, patch: PauseSchemeUpdateInput): Promise<void> {
    const parsed = PauseSchemeUpdateSchema.parse(patch)
    await base.update(id, { ...parsed, updatedAt: nowIso() } as Partial<PauseScheme>)
  },

  /** 当前执行中的方案组。同一时刻至多一组，由 pauseService 保证 */
  async getActiveScheme(): Promise<PauseScheme | undefined> {
    const rows = await db.pauseSchemes.toArray()
    return rows.find((scheme) => scheme.isActive)
  },
}
