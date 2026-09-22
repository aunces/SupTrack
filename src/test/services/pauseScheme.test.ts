import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createIntake } from '@/services/intakeService'
import {
  activateScheme,
  createScheme,
  deleteScheme,
  loadPauseContext,
  stopScheme,
  updateScheme,
  type PauseSchemeDraft,
} from '@/services/pauseService'
import { findActivePauses, isPausedOn } from '@/utils/pause'
import { getStock, resetDb, seedSupplement } from '../helpers/db'

/**
 * 停药方案组语义（§8.3 / T-207 / T-210）。
 *
 * 三条要钉死的规则：
 * 1. **同一时刻至多一组执行中** —— 执行新组自动结束旧组
 * 2. **历史判定不变** —— 结束旧组只影响它之后的日期，之前该停的还是停
 * 3. **记录独立** —— 执行 / 停止方案组不碰任何 DailyIntake
 *
 * 日期写死（激活日由参数传入），所以这些用例与「今天」无关，不会过期。
 */

beforeEach(async () => {
  await resetDb()
})

function draft(
  name: string,
  supplementId: string,
  startDate: string | null = null,
): PauseSchemeDraft {
  return {
    name,
    note: null,
    // startDate = null → 「跟随方案」；给了日期 → 「独立起止」
    entries: [{ supplementId, startDate, endDate: null, reason: null }],
  }
}

describe('createScheme / updateScheme / deleteScheme', () => {
  it('新建的方案组处于未执行状态，条目一起入库', async () => {
    const supplement = await seedSupplement()
    const scheme = await createScheme(draft('抗生素期间', supplement.id))

    expect(scheme.isActive).toBe(false)
    expect(scheme.activatedAt).toBeNull()
    expect(scheme.endedAt).toBeNull()
    expect(await db.pauseSchemes.count()).toBe(1)
    expect(await db.pausePeriods.where('schemeId').equals(scheme.id).count()).toBe(1)
  })

  it('编辑方案组：条目整体重建（数量与内容都跟着变）', async () => {
    const a = await seedSupplement({ name: 'A' })
    const b = await seedSupplement({ name: 'B' })
    const scheme = await createScheme(draft('情景', a.id))

    await updateScheme(scheme.id, {
      name: '情景改名',
      note: '备注',
      entries: [
        { supplementId: a.id, startDate: null, endDate: null, reason: null },
        { supplementId: b.id, startDate: null, endDate: null, reason: null },
      ],
    })

    const schemes = await db.pauseSchemes.toArray()
    expect(schemes).toHaveLength(1)
    expect(schemes[0].name).toBe('情景改名')
    expect(schemes[0].note).toBe('备注')

    const entries = await db.pausePeriods.where('schemeId').equals(scheme.id).toArray()
    expect(entries).toHaveLength(2)
    expect(new Set(entries.map((entry) => entry.supplementId))).toEqual(new Set([a.id, b.id]))
  })

  it('删除方案组连条目一起删，不留孤儿（DIFF-03 同理）', async () => {
    const supplement = await seedSupplement()
    const scheme = await createScheme(draft('要删掉的', supplement.id))

    await deleteScheme(scheme.id)

    expect(await db.pauseSchemes.count()).toBe(0)
    expect(await db.pausePeriods.count()).toBe(0)
  })
})

describe('activateScheme · 同一时刻至多一组执行中', () => {
  it('执行后 isActive=true、activatedAt=执行日', async () => {
    const supplement = await seedSupplement()
    const scheme = await createScheme(draft('抗生素期间', supplement.id))

    const { endedScheme } = await activateScheme(scheme.id, '2026-09-18')

    expect(endedScheme).toBeNull()
    const stored = await db.pauseSchemes.get(scheme.id)
    expect(stored?.isActive).toBe(true)
    expect(stored?.activatedAt).toBe('2026-09-18')
    expect(stored?.endedAt).toBeNull()
  })

  it('执行新组自动结束旧组，并返回旧组供 UI 提示（W-04）', async () => {
    const supplement = await seedSupplement()
    const oldOne = await createScheme(draft('抗生素期间', supplement.id))
    const newOne = await createScheme(draft('服用碘剂前后', supplement.id))

    await activateScheme(oldOne.id, '2026-09-18')
    const { endedScheme } = await activateScheme(newOne.id, '2026-09-21')

    expect(endedScheme?.name).toBe('抗生素期间')
    expect(endedScheme?.isActive).toBe(false)
    expect(endedScheme?.endedAt).toBe('2026-09-20')

    const storedOld = await db.pauseSchemes.get(oldOne.id)
    const storedNew = await db.pauseSchemes.get(newOne.id)
    expect(storedOld?.isActive).toBe(false)
    expect(storedOld?.endedAt).toBe('2026-09-20')
    expect(storedNew?.isActive).toBe(true)
    expect(storedNew?.activatedAt).toBe('2026-09-21')
  })

  it('全库任何时刻只有一组 isActive=true', async () => {
    const supplement = await seedSupplement()
    const a = await createScheme(draft('A', supplement.id))
    const b = await createScheme(draft('B', supplement.id))
    const c = await createScheme(draft('C', supplement.id))

    await activateScheme(a.id, '2026-09-18')
    await activateScheme(b.id, '2026-09-19')
    await activateScheme(c.id, '2026-09-20')

    const actives = (await db.pauseSchemes.toArray()).filter((scheme) => scheme.isActive)
    expect(actives).toHaveLength(1)
    expect(actives[0].name).toBe('C')
  })

  it('重复执行同一组：不会把自己结束掉', async () => {
    const supplement = await seedSupplement()
    const scheme = await createScheme(draft('抗生素期间', supplement.id))

    await activateScheme(scheme.id, '2026-09-18')
    const { endedScheme } = await activateScheme(scheme.id, '2026-09-19')

    expect(endedScheme).toBeNull()
    const stored = await db.pauseSchemes.get(scheme.id)
    expect(stored?.isActive).toBe(true)
    expect(stored?.endedAt).toBeNull()
  })

  it('执行当天就停止 → 退回「未执行」，当天不留停用（按了停止就该真的停）', async () => {
    const supplement = await seedSupplement()
    const scheme = await createScheme(draft('当天停', supplement.id))

    await activateScheme(scheme.id, '2026-09-20')
    await stopScheme(scheme.id, '2026-09-20')

    const stored = await db.pauseSchemes.get(scheme.id)
    expect(stored?.isActive).toBe(false)
    expect(stored?.activatedAt).toBeNull()
    expect(stored?.endedAt).toBeNull()
    // 关键：当天不再是停用 —— 闭区间若记成「9/20 起、9/20 止」会覆盖今天
    expect(isPausedOn(supplement.id, '2026-09-20', await loadPauseContext())).toBe(false)
  })

  it('隔天停止：结束日 = 停止日的前一天，停止当天就恢复', async () => {
    const supplement = await seedSupplement()
    const scheme = await createScheme(draft('隔天停', supplement.id))

    await activateScheme(scheme.id, '2026-09-18')
    await stopScheme(scheme.id, '2026-09-21')

    const stored = await db.pauseSchemes.get(scheme.id)
    expect(stored?.isActive).toBe(false)
    expect(stored?.activatedAt).toBe('2026-09-18')
    expect(stored?.endedAt).toBe('2026-09-20')

    const ctx = await loadPauseContext()
    expect(isPausedOn(supplement.id, '2026-09-20', ctx)).toBe(true)
    expect(isPausedOn(supplement.id, '2026-09-21', ctx)).toBe(false)
  })
})

describe('历史判定不受影响', () => {
  it('结束旧组只影响之后的日期，之前的停用仍然成立', async () => {
    const supplement = await seedSupplement()
    const a = await createScheme(draft('抗生素期间', supplement.id))
    const b = await createScheme(draft('服用碘剂前后', supplement.id))

    await activateScheme(a.id, '2026-09-18')
    expect(isPausedOn(supplement.id, '2026-09-19', await loadPauseContext())).toBe(true)

    await activateScheme(b.id, '2026-09-21')
    const ctx = await loadPauseContext()

    // A 的区间是 9/18–9/20：这两天仍然是「停用」，历史没有被改写
    expect(isPausedOn(supplement.id, '2026-09-18', ctx)).toBe(true)
    expect(isPausedOn(supplement.id, '2026-09-19', ctx)).toBe(true)
    expect(isPausedOn(supplement.id, '2026-09-20', ctx)).toBe(true)

    // 9/21 起由 B 接管
    const names = findActivePauses(supplement.id, '2026-09-21', ctx).map((p) => p.scheme?.name)
    expect(names).toContain('服用碘剂前后')
    expect(names).not.toContain('抗生素期间')
  })

  it('执行 / 停止方案组不碰任何记录与余量', async () => {
    const supplement = await seedSupplement({ stockCount: 30 })
    await createIntake({
      date: '2026-09-19',
      supplementId: supplement.id,
      planId: null,
      timeSlot: 'morning',
      amount: 2,
      origin: 'checkin',
    })
    const before = await db.dailyIntakes.toArray()

    const scheme = await createScheme(draft('抗生素期间', supplement.id))
    await activateScheme(scheme.id, '2026-09-18')
    await stopScheme(scheme.id, '2026-09-20')

    expect(await db.dailyIntakes.toArray()).toEqual(before)
    expect(await getStock(supplement.id)).toBe(28)
  })
})

describe('「跟随方案」与「独立起止」的区别（全篇最容易混淆处）', () => {
  it('跟随方案：未执行时不生效，执行后从执行日起停用，停止当天恢复', async () => {
    const supplement = await seedSupplement()
    const scheme = await createScheme(draft('跟随的', supplement.id, null))

    // 从未执行 → 条目不生效
    expect(isPausedOn(supplement.id, '2026-09-19', await loadPauseContext())).toBe(false)

    await activateScheme(scheme.id, '2026-09-19')
    let ctx = await loadPauseContext()
    expect(isPausedOn(supplement.id, '2026-09-18', ctx)).toBe(false) // 执行日之前
    expect(isPausedOn(supplement.id, '2026-09-19', ctx)).toBe(true)
    expect(isPausedOn(supplement.id, '2026-12-31', ctx)).toBe(true) // 未设结束日 = 持续中

    await stopScheme(scheme.id, '2026-09-22')
    ctx = await loadPauseContext()
    expect(isPausedOn(supplement.id, '2026-09-21', ctx)).toBe(true)
    expect(isPausedOn(supplement.id, '2026-09-22', ctx)).toBe(false) // 停止当天就恢复
  })

  it('独立起止：方案组没执行也生效，且不吃方案组的起止', async () => {
    const supplement = await seedSupplement()
    const scheme = await createScheme({
      name: '独立起止的',
      note: null,
      entries: [
        {
          supplementId: supplement.id,
          startDate: '2026-09-15',
          endDate: '2026-09-17',
          reason: '自己的一段时间',
        },
      ],
    })

    // 未执行 → 依然生效
    let ctx = await loadPauseContext()
    expect(isPausedOn(supplement.id, '2026-09-16', ctx)).toBe(true)
    expect(isPausedOn(supplement.id, '2026-09-18', ctx)).toBe(false)

    // 执行方案组也不会把它的区间改成方案组的
    await activateScheme(scheme.id, '2026-09-20')
    ctx = await loadPauseContext()
    expect(isPausedOn(supplement.id, '2026-09-16', ctx)).toBe(true)
    expect(isPausedOn(supplement.id, '2026-09-21', ctx)).toBe(false)
  })

  it('两种条目可以在同一组里共存，判定取并集', async () => {
    const follow = await seedSupplement({ name: '跟随' })
    const own = await seedSupplement({ name: '独立' })
    const scheme = await createScheme({
      name: '混着来',
      note: null,
      entries: [
        { supplementId: follow.id, startDate: null, endDate: null, reason: null },
        { supplementId: own.id, startDate: '2026-09-15', endDate: '2026-09-16', reason: null },
      ],
    })

    await activateScheme(scheme.id, '2026-09-20')
    const ctx = await loadPauseContext()

    // 9/15：只有「独立」在生效
    expect(isPausedOn(follow.id, '2026-09-15', ctx)).toBe(false)
    expect(isPausedOn(own.id, '2026-09-15', ctx)).toBe(true)

    // 9/20 之后：只有「跟随」在生效
    expect(isPausedOn(follow.id, '2026-09-20', ctx)).toBe(true)
    expect(isPausedOn(own.id, '2026-09-20', ctx)).toBe(false)
  })
})

/**
 * 周期方案（D-44）：写库 → 执行 → 判定 的整条路径。
 *
 * 边界算术已经在 utils/pause.test.ts 里钉过了，这里只验两件容易写歪的事：
 *   ① 周期参数有没有**真的存下来**（而不是被 schema 的 default 冲成连续）
 *   ② **执行日有没有真的当成周期第 1 天**（复用 activatedAt 的落地效果）
 */
describe('周期方案（D-44）· 端到端', () => {
  const ANCHOR = '2026-09-01'
  const cyclicDraft = (name: string, supplementId: string): PauseSchemeDraft => ({
    ...draft(name, supplementId),
    cycleMode: 'cyclic',
    cycleOnDays: 21,
    cycleOffDays: 7,
  })

  it('createScheme 存下周期参数；未执行时不产生任何停用', async () => {
    const supplement = await seedSupplement()
    const scheme = await createScheme(cyclicDraft('21/7 疗程', supplement.id))

    expect(scheme.cycleMode).toBe('cyclic')
    expect(scheme.cycleOnDays).toBe(21)
    expect(scheme.cycleOffDays).toBe(7)

    const ctx = await loadPauseContext()
    expect(isPausedOn(supplement.id, '2026-09-22', ctx)).toBe(false)
  })

  it('执行日 = 周期第 1 天：9/21 不停用、9/22 停用、恢复日 9/29', async () => {
    const supplement = await seedSupplement()
    const scheme = await createScheme(cyclicDraft('21/7 疗程', supplement.id))
    await activateScheme(scheme.id, ANCHOR)

    const ctx = await loadPauseContext()
    expect(isPausedOn(supplement.id, '2026-09-20', ctx)).toBe(false) // 第 20 天
    expect(isPausedOn(supplement.id, '2026-09-21', ctx)).toBe(false) // 第 21 天
    expect(isPausedOn(supplement.id, '2026-09-22', ctx)).toBe(true) // 第 22 天

    const pauses = findActivePauses(supplement.id, '2026-09-22', ctx)
    expect(pauses).toHaveLength(1)
    expect(pauses[0].reasonLabel).toBe('21/7 疗程')
    expect(pauses[0].resumeDate).toBe('2026-09-29')
  })

  it('停止方案组后周期立即失效', async () => {
    const supplement = await seedSupplement()
    const scheme = await createScheme(cyclicDraft('21/7 疗程', supplement.id))
    await activateScheme(scheme.id, ANCHOR)
    await stopScheme(scheme.id, '2026-09-22')

    const ctx = await loadPauseContext()
    expect(isPausedOn(supplement.id, '2026-09-22', ctx)).toBe(false)
    expect(isPausedOn(supplement.id, '2026-09-23', ctx)).toBe(false)
  })

  it('updateScheme 能在「连续」与「周期」之间来回改', async () => {
    const supplement = await seedSupplement()
    const scheme = await createScheme(draft('情景', supplement.id))
    expect(scheme.cycleMode).toBe('continuous')
    expect(scheme.cycleOnDays).toBeNull()

    await updateScheme(scheme.id, {
      ...cyclicDraft('情景', supplement.id),
      cycleOnDays: 5,
      cycleOffDays: 2,
    })
    const cyclic = await db.pauseSchemes.get(scheme.id)
    expect(cyclic?.cycleMode).toBe('cyclic')
    expect(cyclic?.cycleOnDays).toBe(5)

    await updateScheme(scheme.id, {
      name: '情景',
      note: null,
      cycleMode: 'continuous',
      cycleOnDays: null,
      cycleOffDays: null,
      entries: [{ supplementId: supplement.id, startDate: null, endDate: null, reason: null }],
    })
    const back = await db.pauseSchemes.get(scheme.id)
    expect(back?.cycleMode).toBe('continuous')
    expect(back?.cycleOnDays).toBeNull()

    // 改回连续后：从执行日起一直停用，不再有「吃段」
    await activateScheme(scheme.id, ANCHOR)
    const ctx = await loadPauseContext()
    expect(isPausedOn(supplement.id, '2026-09-22', ctx)).toBe(true)
  })

  it('周期参数非法 → 被 Zod 拦下，写不进库', async () => {
    const supplement = await seedSupplement()
    await expect(
      createScheme({
        ...draft('坏周期', supplement.id),
        cycleMode: 'cyclic',
        cycleOnDays: 21,
        cycleOffDays: null,
      }),
    ).rejects.toThrow('周期方案必须填写「吃几天 / 停几天」')
    expect(await db.pauseSchemes.count()).toBe(0)
  })
})
