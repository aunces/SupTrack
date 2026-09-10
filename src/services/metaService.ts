import { DEFAULT_BACKFILL_WINDOW_DAYS, META_KEY } from '@/constants/enums'
import { SCHEMA_VERSION } from '@/db/migrations'
import { metaRepository } from '@/repositories'

export const metaService = {
  async get<T = unknown>(key: string): Promise<T | undefined> {
    return metaRepository.get<T>(key)
  },

  async set(key: string, value: unknown): Promise<void> {
    await metaRepository.set(key, value)
  },

  /**
   * 运行时读取，禁止模块级缓存：用户在设置页修改后立即生效。
   */
  async getBackfillWindowDays(): Promise<number> {
    const value = await metaRepository.get<number>(META_KEY.BACKFILL_WINDOW_DAYS)
    return typeof value === 'number' && value > 0 ? value : DEFAULT_BACKFILL_WINDOW_DAYS
  },

  async getSchemaVersion(): Promise<number> {
    const value = await metaRepository.get<number>(META_KEY.SCHEMA_VERSION)
    return typeof value === 'number' ? value : SCHEMA_VERSION
  },

  async setSchemaVersion(version: number): Promise<void> {
    await metaRepository.set(META_KEY.SCHEMA_VERSION, version)
  },

  async initDefaults(): Promise<void> {
    if ((await metaRepository.get(META_KEY.SCHEMA_VERSION)) === undefined) {
      await metaRepository.set(META_KEY.SCHEMA_VERSION, SCHEMA_VERSION)
    }
    if ((await metaRepository.get(META_KEY.BACKFILL_WINDOW_DAYS)) === undefined) {
      await metaRepository.set(META_KEY.BACKFILL_WINDOW_DAYS, DEFAULT_BACKFILL_WINDOW_DAYS)
    }
  },
}
