import { db } from '@/db'
import { pausePeriodRepository, pauseSchemeRepository } from '@/repositories'
import { parseOrThrow } from '@/schemas/common'
import { PausePeriodCreateSchema } from '@/schemas/pausePeriod'
import type { PausePeriodUpdateInput } from '@/schemas/pausePeriod'
import { PauseSchemeCreateSchema, PauseSchemeUpdateSchema } from '@/schemas/pauseScheme'
import type { PausePeriod, PauseScheme } from '@/types'
import { publishDataChange } from '@/utils/broadcast'
import { addDays } from '@/utils/date'
import { newId, nowIso } from '@/utils/id'
import type { PauseContext } from '@/utils/pause'

/**
 * 停药用例（实施指导书 §7.4）。
 *
 * 两个概念：
 * - 临时停药（schemeId = null）：随手加一条，轻量高频，必须有 startDate
 * - 停药方案组（PauseScheme）：成套情景，一键切换，同一时刻至多一组执行中
 * 两者判定时取并集（utils/pause.ts::findActivePauses）。
 */

export interface PausePeriodDraft {
  schemeId: string | null
  supplementId: string
  startDate: string | null
  endDate: string | null
  reason: string | null
}

export interface PauseEntryInput {
  supplementId: string
  startDate: string | null
  endDate: string | null
  reason: string | null
}

export interface PauseSchemeDraft {
  name: string
  note: string | null
  entries: PauseEntryInput[]
}

// ── 临时停药 ─────────────────────────────────────────────────

export async function createPausePeriod(input: PausePeriodDraft): Promise<PausePeriod> {
  const now = nowIso()
  // 临时停药的必填校验由 PausePeriodCreateSchema 的 refine 负责（schemeId 为空则 startDate 必填）
  const record = parseOrThrow(PausePeriodCreateSchema, {
    ...input,
    id: newId(),
    createdAt: now,
    updatedAt: now,
  })
  await pausePeriodRepository.insert(record)
  publishDataChange()
  return record
}

export async function updatePausePeriod(id: string, patch: PausePeriodUpdateInput): Promise<void> {
  if (!(await db.pausePeriods.get(id))) throw new Error('停药条目不存在')
  await pausePeriodRepository.update(id, patch)
  publishDataChange()
}

export async function deletePausePeriod(id: string): Promise<void> {
  await db.pausePeriods.delete(id)
  publishDataChange()
}

// ── 方案组 ───────────────────────────────────────────────────

export async function listSchemes(): Promise<PauseScheme[]> {
  return pauseSchemeRepository.all()
}

/** 新建方案组：组本身处于「未执行」状态，执行由 activateScheme 负责 */
export async function createScheme(input: PauseSchemeDraft): Promise<PauseScheme> {
  const now = nowIso()
  const scheme = parseOrThrow(PauseSchemeCreateSchema, {
    id: newId(),
    name: input.name,
    note: input.note,
    isActive: false,
    activatedAt: null,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
  })

  await db.transaction('rw', db.pauseSchemes, db.pausePeriods, async () => {
    await db.pauseSchemes.add(scheme)
    for (const entry of input.entries) {
      const period = parseOrThrow(PausePeriodCreateSchema, {
        id: newId(),
        schemeId: scheme.id,
        supplementId: entry.supplementId,
        startDate: entry.startDate,
        endDate: entry.endDate,
        reason: entry.reason,
        createdAt: now,
        updatedAt: now,
      })
      await db.pausePeriods.add(period)
    }
  })

  publishDataChange()
  return scheme
}

/**
 * 更新方案组：条目整体重建（先删后建）。
 * 理由：条目数量少、编辑界面是一次性提交的；增量 diff 只会带来「哪条对应哪条」的复杂度。
 */
export async function updateScheme(id: string, input: PauseSchemeDraft): Promise<void> {
  const now = nowIso()
  if (!(await db.pauseSchemes.get(id))) throw new Error('方案组不存在')

  const patch = parseOrThrow(PauseSchemeUpdateSchema, { name: input.name, note: input.note })

  await db.transaction('rw', db.pauseSchemes, db.pausePeriods, async () => {
    await db.pauseSchemes.update(id, { ...patch, updatedAt: now })
    await db.pausePeriods.where('schemeId').equals(id).delete()
    for (const entry of input.entries) {
      const period = parseOrThrow(PausePeriodCreateSchema, {
        id: newId(),
        schemeId: id,
        supplementId: entry.supplementId,
        startDate: entry.startDate,
        endDate: entry.endDate,
        reason: entry.reason,
        createdAt: now,
        updatedAt: now,
      })
      await db.pausePeriods.add(period)
    }
  })

  publishDataChange()
}

/**
 * 删除方案组：连它的条目一起硬删除。
 * 不保留孤儿条目 —— 指向已删除组的条目会永远「不生效」，只会在数据里积灰（DIFF-03 同理）。
 */
export async function deleteScheme(id: string): Promise<void> {
  await db.transaction('rw', db.pauseSchemes, db.pausePeriods, async () => {
    await db.pauseSchemes.delete(id)
    await db.pausePeriods.where('schemeId').equals(id).delete()
  })
  publishDataChange()
}

/** 「停止」是立即失效：结束日记成 date 的前一天，当天就恢复正常（§8.3） */
function endDateForStop(date: string): string {
  return addDays(date, -1)
}

/**
 * 执行方案组：同一时刻至多一组执行中，执行新组自动结束旧组。
 * @returns 被结束的旧组（供 UI 提示「将结束『抗生素期间』」，W-04）
 */
export async function activateScheme(
  id: string,
  date: string,
): Promise<{ endedScheme: PauseScheme | null }> {
  let endedScheme: PauseScheme | null = null

  await db.transaction('rw', db.pauseSchemes, async () => {
    const target = await db.pauseSchemes.get(id)
    if (!target) throw new Error('方案组不存在')

    const current = await pauseSchemeRepository.getActiveScheme()
    if (current && current.id !== id) {
      // 旧组若也是今天才执行的，净效果为零 → 退回「未执行」（理由同 stopScheme）。
      // 顺带避开一个 schema 陷阱：endedAt 记成「执行日前一天」会违反
      // PauseSchemeUpdateSchema 的「结束日期不能早于执行日期」。
      const patch =
        current.activatedAt == null || current.activatedAt === date
          ? { isActive: false, activatedAt: null, endedAt: null, updatedAt: nowIso() }
          : { isActive: false, endedAt: endDateForStop(date), updatedAt: nowIso() }
      await db.pauseSchemes.update(current.id, patch)
      endedScheme = { ...current, ...patch }
    }

    await db.pauseSchemes.update(id, {
      isActive: true,
      activatedAt: date,
      endedAt: null,
      updatedAt: nowIso(),
    })
  })

  publishDataChange()
  return { endedScheme }
}

/**
 * 停止方案组：条目立即失效，历史记录不变。
 *
 * ★ 当天执行、当天停止 → **退回「未执行」**，而不是记成 endedAt = 执行日。
 *   后者会让闭区间覆盖今天：用户明明按了「停止」，今日页却还写着「停用中」。
 *   这段方案从没完整生效过一天，净效果为零，「未执行」才是实话 ——
 *   而且它还能被原样再次执行，不用重填一遍。
 */
export async function stopScheme(id: string, date: string): Promise<void> {
  const scheme = await db.pauseSchemes.get(id)
  if (!scheme) throw new Error('方案组不存在')

  if (scheme.activatedAt == null || scheme.activatedAt === date) {
    await pauseSchemeRepository.update(id, {
      isActive: false,
      activatedAt: null,
      endedAt: null,
    })
    publishDataChange()
    return
  }

  await pauseSchemeRepository.update(id, {
    isActive: false,
    endedAt: endDateForStop(date),
  })
  publishDataChange()
}

/** 今日页需要的上下文（periods + schemes Map） */
export async function loadPauseContext(): Promise<PauseContext> {
  const [periods, schemes] = await Promise.all([
    pausePeriodRepository.all(),
    pauseSchemeRepository.all(),
  ])
  return { periods, schemes: new Map(schemes.map((scheme) => [scheme.id, scheme])) }
}

/** 方案组覆盖了几项（列表展示用） */
export async function countSchemeEntries(schemeId: string): Promise<number> {
  return db.pausePeriods.where('schemeId').equals(schemeId).count()
}
