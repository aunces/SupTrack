import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import {
  activateScheme,
  createPausePeriod,
  createScheme,
  deleteScheme,
  loadPauseContext,
  stopScheme,
  updatePausePeriod,
} from '@/services/pauseService'
import { isPausedOn } from '@/utils/pause'
import { resetDb, seedSupplement } from '../helpers/db'

beforeEach(async () => {
  await resetDb()
})

describe('临时停药', () => {
  it('创建成功并出现在上下文里', async () => {
    const supplement = await seedSupplement()
    const period = await createPausePeriod({
      schemeId: null,
      supplementId: supplement.id,
      startDate: '2026-09-19',
      endDate: '2026-09-21',
      reason: '胃不舒服',
    })

    const ctx = await loadPauseContext()
    expect(isPausedOn(supplement.id, '2026-09-20', ctx)).toBe(true)
    expect(isPausedOn(supplement.id, '2026-09-22', ctx)).toBe(false)
    expect(period.reason).toBe('胃不舒服')
  })

  it('startDate 为空 → 抛「临时停药必须填写开始日期」', async () => {
    const supplement = await seedSupplement()
    await expect(
      createPausePeriod({
        schemeId: null,
        supplementId: supplement.id,
        startDate: null,
        endDate: null,
        reason: null,
      }),
    ).rejects.toThrow(/临时停药必须填写开始日期/)
    expect(await db.pausePeriods.count()).toBe(0)
  })

  it('结束日期早于开始日期被拒', async () => {
    const supplement = await seedSupplement()
    await expect(
      createPausePeriod({
        schemeId: null,
        supplementId: supplement.id,
        startDate: '2026-09-21',
        endDate: '2026-09-19',
        reason: null,
      }),
    ).rejects.toThrow(/结束日期不能早于开始日期/)
  })

  it('修改与删除', async () => {
    const supplement = await seedSupplement()
    const period = await createPausePeriod({
      schemeId: null,
      supplementId: supplement.id,
      startDate: '2026-09-19',
      endDate: null,
      reason: null,
    })

    await updatePausePeriod(period.id, { endDate: '2026-09-20', reason: '改个原因' })
    const updated = await db.pausePeriods.get(period.id)
    expect(updated?.endDate).toBe('2026-09-20')
    expect(updated?.reason).toBe('改个原因')

    await updatePausePeriod('not-exist', { reason: 'x' }).catch(() => undefined)
    expect(await db.pausePeriods.count()).toBe(1)
  })
})

describe('方案组', () => {
  it('新建方案组时组处于未执行状态，条目跟随组', async () => {
    const supplement = await seedSupplement()
    const scheme = await createScheme({
      name: '抗生素期间',
      note: null,
      entries: [{ supplementId: supplement.id, startDate: null, endDate: null, reason: '抗生素' }],
    })

    expect(scheme.isActive).toBe(false)
    expect(scheme.activatedAt).toBeNull()

    // 组未执行 → 条目不生效
    const ctx = await loadPauseContext()
    expect(isPausedOn(supplement.id, '2026-09-20', ctx)).toBe(false)
  })

  it('执行方案组后条目按 activatedAt 生效', async () => {
    const supplement = await seedSupplement()
    const scheme = await createScheme({
      name: '抗生素期间',
      note: null,
      entries: [{ supplementId: supplement.id, startDate: null, endDate: null, reason: null }],
    })

    await activateScheme(scheme.id, '2026-09-18')

    const ctx = await loadPauseContext()
    expect(isPausedOn(supplement.id, '2026-09-18', ctx)).toBe(true)
    expect(isPausedOn(supplement.id, '2026-09-17', ctx)).toBe(false)
  })

  it('执行新组自动结束旧组：旧组 isActive=false 且 endedAt 有值', async () => {
    const supplement = await seedSupplement()
    const oldScheme = await createScheme({
      name: '抗生素期间',
      note: null,
      entries: [{ supplementId: supplement.id, startDate: null, endDate: null, reason: null }],
    })
    const newScheme = await createScheme({
      name: '服用碘剂前后',
      note: null,
      entries: [{ supplementId: supplement.id, startDate: null, endDate: null, reason: null }],
    })

    await activateScheme(oldScheme.id, '2026-09-01')
    const { endedScheme } = await activateScheme(newScheme.id, '2026-09-20')

    expect(endedScheme?.id).toBe(oldScheme.id)
    const oldRow = await db.pauseSchemes.get(oldScheme.id)
    expect(oldRow?.isActive).toBe(false)
    // 立即交接：旧组结束于新组开始的前一天
    expect(oldRow?.endedAt).toBe('2026-09-19')

    const active = (await db.pauseSchemes.toArray()).filter((s) => s.isActive)
    expect(active.map((s) => s.id)).toEqual([newScheme.id])
  })

  it('停止方案组：条目立即失效，历史记录不变', async () => {
    const supplement = await seedSupplement()
    const scheme = await createScheme({
      name: '抗生素期间',
      note: null,
      entries: [{ supplementId: supplement.id, startDate: null, endDate: null, reason: null }],
    })
    await activateScheme(scheme.id, '2026-09-10')

    await stopScheme(scheme.id, '2026-09-20')

    const row = await db.pauseSchemes.get(scheme.id)
    expect(row?.isActive).toBe(false)
    expect(row?.endedAt).toBe('2026-09-19')

    // 停止当天恢复正常，但之前的停用判定仍成立（历史记录不变）
    const ctx = await loadPauseContext()
    expect(isPausedOn(supplement.id, '2026-09-20', ctx)).toBe(false)
    expect(isPausedOn(supplement.id, '2026-09-19', ctx)).toBe(true)
  })

  it('删除方案组连它的条目一起硬删除', async () => {
    const supplement = await seedSupplement()
    const scheme = await createScheme({
      name: '抗生素期间',
      note: null,
      entries: [{ supplementId: supplement.id, startDate: null, endDate: null, reason: null }],
    })

    await deleteScheme(scheme.id)

    expect(await db.pauseSchemes.count()).toBe(0)
    expect(await db.pausePeriods.count()).toBe(0)
  })

  it('执行不存在的方案组抛错', async () => {
    await expect(activateScheme('not-exist', '2026-09-20')).rejects.toThrow(/方案组不存在/)
  })
})
