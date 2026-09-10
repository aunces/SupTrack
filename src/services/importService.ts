import { db } from '@/db'
import { migratePayload, type MigrationPayload } from '@/db/migrations'
import { NOT_DELETED } from '@/constants/deletedAt'
import { META_KEY } from '@/constants/enums'
import { metaRepository } from '@/repositories'
import { metaService } from '@/services/metaService'
import { publishDataChange } from '@/utils/broadcast'
import { mergeRecord } from '@/utils/merge'
import { nowIso } from '@/utils/id'

export const EXPORT_TABLES = [
  'supplements',
  'ingredients',
  'supplementIngredients',
  'dosagePlans',
  'dailyIntakes',
  'pausePeriods',
  'bodyFeedbacks',
  'stockBatches',
  'stockLogs',
] as const

export type ExportTableName = (typeof EXPORT_TABLES)[number]

export interface ExportPayload {
  meta: Record<string, unknown>
  data: Record<string, unknown[]>
  exportedAt: string
}

export type ImportStrategy = 'overwrite' | 'merge'

export interface ImportIssue {
  type: 'A' | 'B' | 'C'
  id: string
  message: string
}

export interface ImportSummary {
  added: number
  updated: number
  kept: number
  skipped: number
  issues: ImportIssue[]
  migratedFrom: number | null
}

/** 全量导出，包含已软删除记录 */
export async function exportData(): Promise<ExportPayload> {
  const data: Record<string, unknown[]> = {}
  for (const table of EXPORT_TABLES) {
    data[table] = await db.table(table).toArray()
  }
  const metaRecords = await metaRepository.all()
  return {
    meta: Object.fromEntries(metaRecords.map((m) => [m.key, m.value])),
    data,
    exportedAt: nowIso(),
  }
}

export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function exportToFile(): Promise<void> {
  const payload = await exportData()
  downloadJson(`suptrack-backup-${payload.exportedAt.slice(0, 10)}.json`, payload)
  await metaRepository.set(META_KEY.LAST_EXPORT_AT, payload.exportedAt)
}

/** 导入前预检：返回状态异常（A/B/C）记录，导入时跳过 */
export function detectIssues(dailyIntakes: Record<string, unknown>[]): ImportIssue[] {
  const issues: ImportIssue[] = []
  for (const row of dailyIntakes) {
    const id = String(row.id)
    const deleted = row.deletedAt != null && row.deletedAt !== NOT_DELETED
    const stockState = row.stockState
    if (deleted && stockState === 'deducted') {
      issues.push({ type: 'A', id, message: '已删除却标记为已扣库存' })
    } else if (!deleted && (stockState === 'was_deducted' || stockState === 'unknown')) {
      issues.push({ type: 'B', id, message: '未删除却带有恢复意图状态' })
    } else if (row.status === 'skipped' && stockState === 'deducted') {
      issues.push({ type: 'C', id, message: '漏服却标记为已扣库存' })
    }
  }
  return issues
}

export async function importData(
  raw: string | ExportPayload,
  strategy: ImportStrategy,
  options: { skipBackup?: boolean } = {},
): Promise<ImportSummary> {
  const payload = typeof raw === 'string' ? (JSON.parse(raw) as ExportPayload) : raw
  if (!payload?.data) throw new Error('导入文件格式不正确')

  // 强制备份（测试环境可跳过，避免依赖浏览器下载能力）
  if (!options.skipBackup) await exportToFile()

  const fromVersion =
    typeof payload.meta?.schemaVersion === 'number' ? payload.meta.schemaVersion : null
  const { payload: migrated } = migratePayload(
    {
      meta: payload.meta ?? {},
      data: payload.data,
    } as MigrationPayload,
    fromVersion ?? 10,
  )

  const issues = detectIssues(migrated.data.dailyIntakes ?? [])
  const issueIds = new Set(issues.map((i) => i.id))

  const summary: ImportSummary = {
    added: 0,
    updated: 0,
    kept: 0,
    skipped: issues.length,
    issues,
    migratedFrom: fromVersion,
  }

  await db.transaction(
    'rw',
    EXPORT_TABLES.map((t) => db.table(t)),
    async () => {
      for (const table of EXPORT_TABLES) {
        if (strategy === 'overwrite') await db.table(table).clear()

        const rows = migrated.data[table] ?? []
        for (const row of rows) {
          const id = String((row as { id: string }).id)
          if (table === 'dailyIntakes' && issueIds.has(id)) continue

          const existing = await db.table(table).get(id)
          if (strategy === 'overwrite') {
            await db.table(table).put(row)
            summary.added += 1
            continue
          }

          const merged = mergeRecord(existing, row, table)
          if (!existing) {
            await db.table(table).put(merged)
            summary.added += 1
          } else if (merged !== existing) {
            await db.table(table).put(merged)
            summary.updated += 1
          } else {
            summary.kept += 1
          }
        }
      }
    },
  )

  // Meta 不合并：保留本地值，仅更新 schemaVersion
  await metaService.setSchemaVersion(10)
  publishDataChange()
  return summary
}
