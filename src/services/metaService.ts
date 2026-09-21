import { BACKUP_REMIND_DAYS } from '@/constants/enums'
import { META_KEY } from '@/db/schema'
import { metaRepository } from '@/repositories'
import { diffCalendarDays, formatDate, today } from '@/utils/date'

/** 当前 schema 版本。新库从 version(1) 起步，此处只作备份文件与 meta 的标记 */
export const SCHEMA_VERSION = 12

export const metaService = {
  async get<T = unknown>(key: string): Promise<T | undefined> {
    return metaRepository.get<T>(key)
  },

  async set(key: string, value: unknown): Promise<void> {
    await metaRepository.set(key, value)
  },

  async getSchemaVersion(): Promise<number> {
    const value = await metaRepository.get<number>(META_KEY.SCHEMA_VERSION)
    return typeof value === 'number' ? value : SCHEMA_VERSION
  },

  async setSchemaVersion(version: number): Promise<void> {
    await metaRepository.set(META_KEY.SCHEMA_VERSION, version)
  },

  /** 上次导出时间（ISO）。设置页必须常驻显示，让「多久没备份」可感知 */
  async getLastExportAt(): Promise<string | null> {
    const value = await metaRepository.get<string>(META_KEY.LAST_EXPORT_AT)
    return typeof value === 'string' ? value : null
  },

  async setLastExportAt(iso: string): Promise<void> {
    await metaRepository.set(META_KEY.LAST_EXPORT_AT, iso)
  },

  /**
   * 备份提醒（M3）：距上次导出超过 30 天就提醒。
   * 从未导出过也提醒 —— 这个产品的数据只存在本机，没有第二份。
   */
  async needsBackupRemind(): Promise<boolean> {
    const last = await metaService.getLastExportAt()
    if (!last) return true
    return diffCalendarDays(formatDate(new Date(last)), today()) >= BACKUP_REMIND_DAYS
  },

  async initDefaults(): Promise<void> {
    if ((await metaRepository.get(META_KEY.SCHEMA_VERSION)) === undefined) {
      await metaRepository.set(META_KEY.SCHEMA_VERSION, SCHEMA_VERSION)
    }
  },
}
