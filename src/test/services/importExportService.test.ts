import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  buildExport,
  importFromFile,
  type ExportPayload,
} from '@/services/importExportService'
import { resetDb, seedIntake, seedPlan, seedSupplement } from '../helpers/db'
import { metaService } from '@/services/metaService'
import { newId } from '@/utils/id'

beforeEach(async () => {
  await resetDb()
})

async function seedAll() {
  const supplement = await seedSupplement({ name: '维生素 D3' })
  const plan = await seedPlan(supplement.id)
  await seedIntake({ supplementId: supplement.id, planId: plan.id })
  // 主键必须是合法 UUID —— 备份文件要逐条过 Zod Create 校验
  const schemeId = newId()
  await db.pauseSchemes.add({
    id: schemeId,
    name: '抗生素期间',
    note: null,
    isActive: true,
    activatedAt: '2026-09-18',
    endedAt: null,
    cycleMode: 'continuous',
    cycleOnDays: null,
    cycleOffDays: null,
    createdAt: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-18T00:00:00.000Z',
  })
  await db.pausePeriods.add({
    id: newId(),
    schemeId,
    supplementId: supplement.id,
    startDate: null,
    endDate: null,
    reason: null,
    createdAt: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-18T00:00:00.000Z',
  })
  const ingredientId = newId()
  await db.ingredients.add({
    id: ingredientId,
    name: '维生素 D3',
    unit: 'IU',
    recommendedDailyIntake: null,
    upperLimit: null,
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  })
  await db.supplementIngredients.add({
    id: newId(),
    supplementId: supplement.id,
    ingredientId,
    amountPerServing: 1000,
    effectiveFrom: '2026-09-01',
    effectiveTo: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  })
  return supplement
}

async function counts() {
  return {
    supplements: await db.supplements.count(),
    dosagePlans: await db.dosagePlans.count(),
    dailyIntakes: await db.dailyIntakes.count(),
    pausePeriods: await db.pausePeriods.count(),
    pauseSchemes: await db.pauseSchemes.count(),
    ingredients: await db.ingredients.count(),
    supplementIngredients: await db.supplementIngredients.count(),
  }
}

function fileOf(payload: unknown): File {
  return new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' })
}

describe('buildExport', () => {
  it('带上 format 与 formatVersion，8 张表齐全', async () => {
    await seedAll()
    const payload = await buildExport()

    expect(payload.format).toBe(EXPORT_FORMAT)
    expect(payload.formatVersion).toBe(EXPORT_FORMAT_VERSION)
    expect(Object.keys(payload.data).sort()).toEqual(
      [
        'dailyIntakes',
        'dosagePlans',
        'ingredients',
        'pausePeriods',
        'pauseSchemes',
        'supplementIngredients',
        'supplements',
      ].sort(),
    )
    expect(payload.data.supplements).toHaveLength(1)
  })
})

describe('importFromFile', () => {
  it('导出 → 清空 → 导入：7 张业务表条数与内容完全还原', async () => {
    const supplement = await seedAll()
    const payload = await buildExport()
    const before = await counts()

    // 清空（模拟换机 / 清缓存后恢复）
    await resetDb()
    expect(await db.supplements.count()).toBe(0)

    const result = await importFromFile(fileOf(payload), { skipBackup: true })

    expect(result.issues).toEqual([])
    expect(await counts()).toEqual(before)
    expect((await db.supplements.get(supplement.id))?.name).toBe('维生素 D3')
    expect((await db.dailyIntakes.toArray())[0].taken).toBe(true)
  })

  it('重复导入同一份备份：覆盖而非累加', async () => {
    await seedAll()
    const payload = await buildExport()

    await importFromFile(fileOf(payload), { skipBackup: true })
    await importFromFile(fileOf(payload), { skipBackup: true })

    expect(await db.supplements.count()).toBe(1)
    expect(await db.dailyIntakes.count()).toBe(1)
  })

  it('formatVersion 不匹配 → 抛错且数据库内容不变', async () => {
    await seedAll()
    const before = await counts()
    const payload = { ...(await buildExport()), formatVersion: 99 }

    await expect(importFromFile(fileOf(payload), { skipBackup: true })).rejects.toThrow(
      /不兼容的版本/,
    )
    expect(await counts()).toEqual(before)
  })

  it('format 字段缺失 → 抛「这不是 SupTrack 的备份文件」', async () => {
    await seedAll()
    const before = await counts()

    await expect(importFromFile(fileOf({ data: {} }), { skipBackup: true })).rejects.toThrow(
      /这不是 SupTrack 的备份文件/,
    )
    expect(await counts()).toEqual(before)
  })

  it('不是合法 JSON → 抛「文件不是有效的 JSON」', async () => {
    const file = new File(['{ not json'], 'broken.json', { type: 'application/json' })
    await expect(importFromFile(file, { skipBackup: true })).rejects.toThrow(/不是有效的 JSON/)
  })

  it('单条非法数据记入 issues 并跳过，其余照常导入', async () => {
    await seedAll()
    const payload: ExportPayload = await buildExport()
    payload.data.supplements = [...payload.data.supplements, { id: 'broken', name: '' } as unknown]

    const result = await importFromFile(fileOf(payload), { skipBackup: true })

    expect(result.imported.supplements).toBe(1)
    expect(result.issues).toHaveLength(1)
    expect(await db.supplements.count()).toBe(1)
  })
})

describe('L-3 · 导入后的「上次导出」时间', () => {
  /**
   * 测试环境是 node（无 DOM），而 skipBackup=false 会真的走 exportToFile()
   * 去点一个 <a> 触发下载。这里只把三处浏览器 API 换成空实现，
   * 让 exportToFile 能跑完 —— 它真正要验证的是 meta 里的 lastExportAt。
   */
  function stubDownloadEnvironment() {
    const anchor = {
      href: '',
      download: '',
      click: vi.fn(),
      remove: vi.fn(),
    }
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn() },
    })
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    })
    // exportToFile 用 window.setTimeout 延迟回收 blob；测试里立即执行即可
    vi.stubGlobal('window', { setTimeout: (fn: () => void) => fn() })
    return anchor
  }

  it('skipBackup=false：导入后 lastExportAt 被修正为本次导入时间，不是备份文件里的旧时间', async () => {
    const anchor = stubDownloadEnvironment()
    try {
      await seedAll()
      // 造一份「很久以前导出」的备份
      const payload: ExportPayload = await buildExport()
      payload.meta = { ...payload.meta, lastExportAt: '2026-01-01T00:00:00.000Z' }

      // 先让当前库里的 lastExportAt 也是旧值，确认改动确实来自导入流程
      await metaService.setLastExportAt('2026-01-02T00:00:00.000Z')

      await importFromFile(fileOf(payload))

      // 自动备份确实发生了（下载被触发）
      expect(anchor.click).toHaveBeenCalled()

      const after = await metaService.getLastExportAt()
      expect(after).not.toBe('2026-01-01T00:00:00.000Z')
      expect(after).not.toBe('2026-01-02T00:00:00.000Z')
      // 应是刚刚（本次导入）写下的
      expect(Date.now() - new Date(after!).getTime()).toBeLessThan(60_000)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('skipBackup=true：不做自动备份，因而保留备份文件里的原值', async () => {
    await seedAll()
    const payload: ExportPayload = await buildExport()
    payload.meta = { ...payload.meta, lastExportAt: '2026-01-01T00:00:00.000Z' }

    await importFromFile(fileOf(payload), { skipBackup: true })

    expect(await metaService.getLastExportAt()).toBe('2026-01-01T00:00:00.000Z')
  })
})
