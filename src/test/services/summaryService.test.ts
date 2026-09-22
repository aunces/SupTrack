import { beforeEach, describe, expect, it } from 'vitest'
import { summarizeDate } from '@/services/summaryService'
import {
  resetDb,
  seedIngredient,
  seedIngredientLink,
  seedIntake,
  seedSupplement,
} from '../helpers/db'

/**
 * 成分汇总（§6.6 / §12.2 / T-302）。
 *
 * 用例与走查第 17–21 步一一对应。日期写死，不依赖「今天」。
 */
const DATE = '2026-09-20'
const DAY_BEFORE = '2026-09-19'

beforeEach(async () => {
  await resetDb()
})

describe('口径 1 · 只统计 taken=true', () => {
  it('打卡的记录计入合计（走查第 17 步：每份 1000 IU → 合计 1000 IU）', async () => {
    const supplement = await seedSupplement({ name: '维生素 D3 胶囊' })
    const d3 = await seedIngredient({ name: '维生素 D3', unit: 'IU' })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: d3.id,
      amountPerServing: 1000,
    })
    await seedIntake({ date: DATE, supplementId: supplement.id, amount: 1, taken: true })

    const totals = await summarizeDate(DATE)

    expect(totals).toHaveLength(1)
    expect(totals[0].name).toBe('维生素 D3')
    expect(totals[0].total).toBe(1000)
    expect(totals[0].displayValue).toBe(1000)
    expect(totals[0].displayUnit).toBe('IU')
    expect(totals[0].sources).toEqual([
      { supplementId: supplement.id, supplementName: '维生素 D3 胶囊', amount: 1000 },
    ])
  })

  it('标了漏服的记录**不计入**（走查第 21 步）', async () => {
    const supplement = await seedSupplement()
    const d3 = await seedIngredient({ unit: 'IU' })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: d3.id,
      amountPerServing: 1000,
    })
    await seedIntake({
      date: DATE,
      supplementId: supplement.id,
      amount: 1,
      taken: false,
      origin: 'backfill',
      isExtra: true,
    })

    expect(await summarizeDate(DATE)).toEqual([])
  })

  it('同一天里已服用与漏服并存 → 只算已服用那条', async () => {
    const a = await seedSupplement({ name: 'A' })
    const b = await seedSupplement({ name: 'B' })
    const d3 = await seedIngredient({ unit: 'IU' })
    await seedIngredientLink({ supplementId: a.id, ingredientId: d3.id, amountPerServing: 1000 })
    await seedIngredientLink({ supplementId: b.id, ingredientId: d3.id, amountPerServing: 400 })
    await seedIntake({ date: DATE, supplementId: a.id, amount: 1, taken: true })
    await seedIntake({
      date: DATE,
      supplementId: b.id,
      amount: 1,
      taken: false,
      origin: 'backfill',
      isExtra: true,
      timeSlot: 'evening',
    })

    const totals = await summarizeDate(DATE)

    expect(totals).toHaveLength(1)
    expect(totals[0].total).toBe(1000)
    expect(totals[0].sources).toHaveLength(1)
  })

  it('服用量翻倍则贡献翻倍（amount 参与乘法）', async () => {
    const supplement = await seedSupplement()
    const d3 = await seedIngredient({ unit: 'IU' })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: d3.id,
      amountPerServing: 1000,
    })
    await seedIntake({ date: DATE, supplementId: supplement.id, amount: 3, taken: true })

    expect((await summarizeDate(DATE))[0].total).toBe(3000)
  })
})

describe('口径 2 · 按当日有效配方', () => {
  it('跨补剂归并：两个含 D3 的补剂合计正确、来源列两个（走查第 18 步）', async () => {
    const capsule = await seedSupplement({ name: '维生素 D3 胶囊' })
    const multi = await seedSupplement({ name: '复合维生素' })
    const d3 = await seedIngredient({ name: '维生素 D3', unit: 'IU' })
    await seedIngredientLink({
      supplementId: capsule.id,
      ingredientId: d3.id,
      amountPerServing: 1000,
    })
    await seedIngredientLink({ supplementId: multi.id, ingredientId: d3.id, amountPerServing: 400 })
    await seedIntake({ date: DATE, supplementId: capsule.id, amount: 1, taken: true })
    await seedIntake({
      date: DATE,
      supplementId: multi.id,
      amount: 1,
      taken: true,
      timeSlot: 'evening',
    })

    const totals = await summarizeDate(DATE)

    expect(totals).toHaveLength(1)
    expect(totals[0].total).toBe(1400)
    expect(totals[0].sources.map((s) => s.supplementName).sort()).toEqual([
      '复合维生素',
      '维生素 D3 胶囊',
    ])
    expect(totals[0].sources.map((s) => s.amount).sort((a, b) => a - b)).toEqual([400, 1000])
  })

  it('改配方后：今天按新配方（走查第 20 步）', async () => {
    const supplement = await seedSupplement()
    const d3 = await seedIngredient({ unit: 'IU' })
    // 旧配方：9/1–9/19 每份 1000 IU
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: d3.id,
      amountPerServing: 1000,
      effectiveFrom: '2026-09-01',
      effectiveTo: DAY_BEFORE,
    })
    // 新配方：9/20 起每份 2000 IU
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: d3.id,
      amountPerServing: 2000,
      effectiveFrom: DATE,
      effectiveTo: null,
    })
    await seedIntake({ date: DATE, supplementId: supplement.id, amount: 1, taken: true })

    expect((await summarizeDate(DATE))[0].total).toBe(2000)
  })

  it('回看昨天仍按旧配方 —— 历史数字不因今天改配方而变动（走查第 20 步）', async () => {
    const supplement = await seedSupplement()
    const d3 = await seedIngredient({ unit: 'IU' })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: d3.id,
      amountPerServing: 1000,
      effectiveFrom: '2026-09-01',
      effectiveTo: DAY_BEFORE,
    })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: d3.id,
      amountPerServing: 2000,
      effectiveFrom: DATE,
      effectiveTo: null,
    })
    await seedIntake({ date: DAY_BEFORE, supplementId: supplement.id, amount: 1, taken: true })

    expect((await summarizeDate(DAY_BEFORE))[0].total).toBe(1000)
  })

  it('关联尚未生效（effectiveFrom 在未来）→ 该日不算它', async () => {
    const supplement = await seedSupplement()
    const d3 = await seedIngredient({ unit: 'IU' })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: d3.id,
      amountPerServing: 1000,
      effectiveFrom: DATE,
      effectiveTo: null,
    })
    await seedIntake({ date: DAY_BEFORE, supplementId: supplement.id, amount: 1, taken: true })

    expect(await summarizeDate(DAY_BEFORE)).toEqual([])
  })
})

describe('口径 3 · 单位归一 / IU 与 ml 独立', () => {
  it('重量类归一到 μg，并按合计值选展示单位（走查第 19 步）', async () => {
    const supplement = await seedSupplement({ name: '钙镁片' })
    const calcium = await seedIngredient({ name: '钙', unit: 'mg' })
    const magnesium = await seedIngredient({ name: '镁', unit: 'μg' })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: calcium.id,
      amountPerServing: 500,
    })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: magnesium.id,
      amountPerServing: 200,
    })
    await seedIntake({ date: DATE, supplementId: supplement.id, amount: 1, taken: true })

    const totals = await summarizeDate(DATE)
    const byName = new Map(totals.map((t) => [t.name, t]))

    // 500 mg → 500000 μg → 展示回 500 mg
    expect(byName.get('钙')?.total).toBe(500_000)
    expect(byName.get('钙')?.displayValue).toBe(500)
    expect(byName.get('钙')?.displayUnit).toBe('mg')

    // 200 μg 不足 1000 → 仍用 μg
    expect(byName.get('镁')?.total).toBe(200)
    expect(byName.get('镁')?.displayValue).toBe(200)
    expect(byName.get('镁')?.displayUnit).toBe('μg')
  })

  it('合计超过 1000 μg 时展示单位升到 mg', async () => {
    const supplement = await seedSupplement()
    const zinc = await seedIngredient({ name: '锌', unit: 'mg' })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: zinc.id,
      amountPerServing: 1,
    })
    await seedIntake({ date: DATE, supplementId: supplement.id, amount: 1, taken: true })

    const total = (await summarizeDate(DATE))[0]
    expect(total.total).toBe(1000)
    expect(total.displayValue).toBe(1)
    expect(total.displayUnit).toBe('mg')
  })

  it('IU 与 ml 各自独立成行，绝不互相累加（也绝不与 μg 混算）', async () => {
    const supplement = await seedSupplement({ name: '复合制剂' })
    const d3 = await seedIngredient({ name: '维生素 D3', unit: 'IU' })
    const liquid = await seedIngredient({ name: '某液体成分', unit: 'ml' })
    const calcium = await seedIngredient({ name: '钙', unit: 'mg' })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: d3.id,
      amountPerServing: 1000,
    })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: liquid.id,
      amountPerServing: 5,
    })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: calcium.id,
      amountPerServing: 300,
    })
    await seedIntake({ date: DATE, supplementId: supplement.id, amount: 1, taken: true })

    const totals = await summarizeDate(DATE)

    expect(totals).toHaveLength(3)
    const units = totals.map((t) => t.displayUnit).sort()
    expect(units).toEqual(['IU', 'mg', 'ml'])
    // 每一行只有一个单位，不存在「1005」这种跨单位相加的结果
    expect(totals.find((t) => t.displayUnit === 'IU')?.total).toBe(1000)
    expect(totals.find((t) => t.displayUnit === 'ml')?.total).toBe(5)
    expect(totals.find((t) => t.displayUnit === 'mg')?.total).toBe(300_000)
  })

  it('同一成分被多个补剂包含 → 合成一行（不因来源数量分裂成多行）', async () => {
    const a = await seedSupplement({ name: 'A' })
    const b = await seedSupplement({ name: 'B' })
    const d3 = await seedIngredient({ name: '维生素 D3', unit: 'IU' })
    await seedIngredientLink({ supplementId: a.id, ingredientId: d3.id, amountPerServing: 1000 })
    await seedIngredientLink({ supplementId: b.id, ingredientId: d3.id, amountPerServing: 1000 })
    await seedIntake({ date: DATE, supplementId: a.id, amount: 1, taken: true })
    await seedIntake({ date: DATE, supplementId: b.id, amount: 1, taken: true, timeSlot: 'noon' })

    const totals = await summarizeDate(DATE)

    expect(totals).toHaveLength(1)
    expect(totals[0].total).toBe(2000)
    expect(totals[0].sources).toHaveLength(2)
  })
})

describe('口径 4 · 输出不含任何结论性字段（R-02，逐字检查）', () => {
  it('IngredientTotal 的键里没有 level / over / warn / status / percent / advice 之类', async () => {
    const supplement = await seedSupplement()
    const d3 = await seedIngredient({ unit: 'IU', recommendedDailyIntake: 800, upperLimit: 4000 })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: d3.id,
      amountPerServing: 1000,
    })
    await seedIntake({ date: DATE, supplementId: supplement.id, amount: 1, taken: true })

    const total = (await summarizeDate(DATE))[0]
    // 注意：`upperLimit` / `recommendedDailyIntake` 是**允许**的 —— 它们是并列展示的数字本身，
    // 不是对数字的判断。所以这里禁用的是「判断性」的词根，而不是泛泛的 limit。
    const forbidden =
      /overlimit|overLimit|^over|warn|level|status|percent|ratio|advice|suggest|risk|exceed|conclus/i
    const suspicious = Object.keys(total).filter((key) => forbidden.test(key))

    expect(suspicious).toEqual([])
    // 允许的键就是这些，多一个都要问「它是不是在替用户下结论」
    expect(Object.keys(total).sort()).toEqual(
      [
        'displayUnit',
        'displayValue',
        'hasDeletedSupplement',
        'ingredientId',
        'missingRecipe',
        'name',
        'recommendedDailyIntake',
        'sources',
        'total',
        'unit',
        'upperLimit',
      ].sort(),
    )
  })

  it('参考值与上限只是原样带出的数字，不做任何比较或截断', async () => {
    const supplement = await seedSupplement()
    const d3 = await seedIngredient({ unit: 'IU', recommendedDailyIntake: 800, upperLimit: 4000 })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: d3.id,
      amountPerServing: 1400,
    })
    await seedIntake({ date: DATE, supplementId: supplement.id, amount: 1, taken: true })

    const total = (await summarizeDate(DATE))[0]

    // 1400 > 参考值 800，但对象里没有任何字段因此改变
    expect(total.total).toBe(1400)
    expect(total.recommendedDailyIntake).toBe(800)
    expect(total.upperLimit).toBe(4000)
  })

  it('用户没填参考值 → 原样为 null（系统不预置任何默认阈值）', async () => {
    const supplement = await seedSupplement()
    const d3 = await seedIngredient({ unit: 'IU', recommendedDailyIntake: null, upperLimit: null })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: d3.id,
      amountPerServing: 1000,
    })
    await seedIntake({ date: DATE, supplementId: supplement.id, amount: 1, taken: true })

    const total = (await summarizeDate(DATE))[0]
    expect(total.recommendedDailyIntake).toBeNull()
    expect(total.upperLimit).toBeNull()
  })
})

describe('边界与防御', () => {
  it('该日没有任何记录 → 空数组', async () => {
    expect(await summarizeDate(DATE)).toEqual([])
  })

  it('记录存在但补剂没配成分 → 空数组，且 missingRecipe 被标出', async () => {
    const linked = await seedSupplement({ name: '配了的' })
    const unlinked = await seedSupplement({ name: '没配的' })
    const d3 = await seedIngredient({ unit: 'IU' })
    await seedIngredientLink({
      supplementId: linked.id,
      ingredientId: d3.id,
      amountPerServing: 1000,
    })
    await seedIntake({ date: DATE, supplementId: linked.id, amount: 1, taken: true })
    await seedIntake({
      date: DATE,
      supplementId: unlinked.id,
      amount: 1,
      taken: true,
      timeSlot: 'evening',
    })

    const totals = await summarizeDate(DATE)

    expect(totals).toHaveLength(1)
    expect(totals[0].missingRecipe).toBe(true)
    expect(totals[0].hasDeletedSupplement).toBe(false)
  })

  it('补剂已被删除但关联仍在 → 来源标「[已删除的补剂]」', async () => {
    const d3 = await seedIngredient({ unit: 'IU' })
    await seedIngredientLink({ supplementId: 'ghost', ingredientId: d3.id, amountPerServing: 1000 })
    await seedIntake({ date: DATE, supplementId: 'ghost', amount: 1, taken: true })

    const totals = await summarizeDate(DATE)

    expect(totals).toHaveLength(1)
    expect(totals[0].hasDeletedSupplement).toBe(true)
    expect(totals[0].sources[0].supplementName).toBe('[已删除的补剂]')
  })
})
