import { db } from '@/db'
import { metaRepository } from '@/repositories'
import { parseOrThrow } from '@/schemas/common'
import { DailyIntakeCreateSchema } from '@/schemas/dailyIntake'
import { DosagePlanCreateSchema } from '@/schemas/dosagePlan'
import { IngredientCreateSchema } from '@/schemas/ingredient'
import { PausePeriodCreateSchema } from '@/schemas/pausePeriod'
import { PauseSchemeCreateSchema } from '@/schemas/pauseScheme'
import { SupplementCreateSchema } from '@/schemas/supplement'
import { SupplementIngredientCreateSchema } from '@/schemas/supplementIngredient'
import type { ZodTypeAny } from 'zod'
import { nowIso } from '@/utils/id'
import { metaService } from './metaService'

/**
 * 导入 / 导出（实施指导书 §7.6）。
 *
 * 只做覆盖，不做智能合并（DIFF-04）：不做云同步 → 唯一场景是「备份恢复」，覆盖语义最清晰。
 * 导入前自动导出现有数据作为兜底。
 * 不做旧版本迁移、不做差异对比（R-14）。
 */

export const EXPORT_FORMAT = 'suptrack-export'
export const EXPORT_FORMAT_VERSION = 12

export interface ExportPayload {
  format: typeof EXPORT_FORMAT
  formatVersion: number
  exportedAt: string
  appVersion: string
  meta: Record<string, unknown>
  /** 8 张表的全量数据 */
  data: Record<string, unknown[]>
}

export interface ImportResult {
  imported: Record<string, number>
  /** 被跳过的非法条目（不阻塞其余数据导入） */
  issues: string[]
}

const TABLES: Array<{
  key: string
  schema: ZodTypeAny
  getTable: () => { toArray: () => Promise<unknown[]> }
}> = [
  { key: 'supplements', schema: SupplementCreateSchema, getTable: () => db.supplements },
  { key: 'dosagePlans', schema: DosagePlanCreateSchema, getTable: () => db.dosagePlans },
  { key: 'dailyIntakes', schema: DailyIntakeCreateSchema, getTable: () => db.dailyIntakes },
  { key: 'pausePeriods', schema: PausePeriodCreateSchema, getTable: () => db.pausePeriods },
  { key: 'pauseSchemes', schema: PauseSchemeCreateSchema, getTable: () => db.pauseSchemes },
  { key: 'ingredients', schema: IngredientCreateSchema, getTable: () => db.ingredients },
  {
    key: 'supplementIngredients',
    schema: SupplementIngredientCreateSchema,
    getTable: () => db.supplementIngredients,
  },
]

export async function buildExport(): Promise<ExportPayload> {
  const data: Record<string, unknown[]> = {}
  for (const table of TABLES) {
    data[table.key] = await table.getTable().toArray()
  }
  const metaRows = await metaRepository.all()
  const meta: Record<string, unknown> = {}
  for (const row of metaRows) meta[row.key] = row.value

  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: nowIso(),
    appVersion: import.meta.env.VITE_APP_VERSION ?? 'unknown',
    meta,
    data,
  }
}

/** 触发下载并写下 lastExportAt */
export async function exportToFile(): Promise<void> {
  const payload = await buildExport()
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `suptrack-backup-${payload.exportedAt.slice(0, 10)}.json`
  // 必须挂进 DOM 再点：游离节点上的 click() 在部分浏览器里不触发下载。
  // 而且不能在 click() 之后立刻移除节点或 revoke —— 浏览器还没开始读 blob，
  // 那样会把下载掐断（表现就是「下载被取消」）。
  document.body.appendChild(anchor)
  anchor.click()
  window.setTimeout(() => {
    anchor.remove()
    URL.revokeObjectURL(url)
  }, 1000)

  await metaService.setLastExportAt(payload.exportedAt)
}

/**
 * 覆盖式导入。校验顺序任一步失败即中止，数据库保持原样。
 * 第 4 步的非法条目记入 issues 并跳过，不阻塞其余数据。
 */
export async function importFromFile(
  file: File,
  options: { skipBackup?: boolean } = {},
): Promise<ImportResult> {
  let payload: ExportPayload
  try {
    payload = JSON.parse(await file.text()) as ExportPayload
  } catch {
    throw new Error('文件不是有效的 JSON')
  }

  if (payload?.format !== EXPORT_FORMAT) {
    throw new Error('这不是 SupTrack 的备份文件')
  }
  if (payload.formatVersion !== EXPORT_FORMAT_VERSION) {
    throw new Error(`备份文件来自不兼容的版本（v${String(payload.formatVersion)}），本版本无法导入`)
  }

  // 先逐条校验，全部通过校验后再动数据库
  const issues: string[] = []
  const staged = new Map<string, unknown[]>()
  for (const table of TABLES) {
    const rows = Array.isArray(payload.data?.[table.key]) ? payload.data[table.key] : []
    const valid: unknown[] = []
    rows.forEach((row, index) => {
      try {
        valid.push(parseOrThrow(table.schema, row))
      } catch (error) {
        issues.push(`${table.key}[${index}]：${(error as Error).message}`)
      }
    })
    staged.set(table.key, valid)
  }

  // 导入前自动导出现有数据作为兜底（测试用 skipBackup 跳过）
  if (!options.skipBackup) {
    await exportToFile()
  }

  const imported: Record<string, number> = {}

  await db.transaction(
    'rw',
    [
      db.supplements,
      db.dosagePlans,
      db.dailyIntakes,
      db.pausePeriods,
      db.pauseSchemes,
      db.ingredients,
      db.supplementIngredients,
      db.meta,
    ],
    async () => {
      for (const table of TABLES) {
        const records = staged.get(table.key) ?? []
        await db.table(table.key).clear()
        if (records.length > 0) await db.table(table.key).bulkAdd(records)
        imported[table.key] = records.length
      }

      await db.meta.clear()
      for (const [key, value] of Object.entries(payload.meta ?? {})) {
        await db.meta.put({ key, value })
      }
      await metaService.initDefaults()
    },
  )

  return { imported, issues }
}

/** 清除全部数据（设置页危险区，输入「清除」二次确认后调用） */
export async function clearAllData(): Promise<void> {
  await db.delete()
  await db.open()
  await metaService.initDefaults()
}
