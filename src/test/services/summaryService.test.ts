import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { summarizeDate, summarizePlannedDate } from '@/services/summaryService'
import { exceedsUpperLimit } from '@/utils/summary'
import { newId, nowIso } from '@/utils/id'
import {
  resetDb,
  seedIngredient,
  seedIngredientLink,
  seedIntake,
  seedPlan,
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

/**
 * 口径 4 · 数据层不下结论（R-02，逐字检查）。
 *
 * 2026-09-22 起有一处**受控**放行：`exceedsUpperLimit()` 供 UI 标红（D-43）。
 * 它仍然不写进输出对象，所以下面这组「输出对象没有判断性字段」的断言**一字未改**，
 * 唯一变动的是文件末尾新增了一组对该函数的独立用例。
 */
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

/**
 * 超上限判定（D-43，用户裁决的标红口径）。
 *
 * 这里只测一件事：**单位换算**。上限是用户按成分自己的单位填的，
 * 而合计在重量类下被归一到了 μg —— 少一次换算就会在
 * 「成分 mg、每份 1 mg、上限 1 mg」这种最常见的情况下误报超限。
 */
describe('exceedsUpperLimit · 只表达「高于你自配的上限」这一个事实', () => {
  /**
   * 造一组「一种成分 + 一个补剂 + 一条已服用记录」。
   *
   * 名字是必填的：`summarizeDate(DATE)` 返回的是**该日全部成分**，
   * 一个用例里造两组就得按名字取回自己那一行，否则第二个调用会拿到第一个的行。
   */
  async function totalOf(options: {
    /** 同一用例内多次调用时必须给不同名字 */
    name: string
    unit: 'mg' | 'μg' | 'g' | 'IU' | 'ml'
    upperLimit: number | null
    perServing: number
    amount?: number
  }) {
    const supplement = await seedSupplement({ name: `${options.name}胶囊` })
    const ingredient = await seedIngredient({
      name: options.name,
      unit: options.unit,
      upperLimit: options.upperLimit,
    })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: ingredient.id,
      amountPerServing: options.perServing,
    })
    await seedIntake({
      date: DATE,
      supplementId: supplement.id,
      amount: options.amount ?? 1,
      taken: true,
    })

    const found = (await summarizeDate(DATE)).find((item) => item.name === options.name)
    if (!found) throw new Error(`未生成成分行：${options.name}`)
    return found
  }

  it('没设上限 → 永远不判超限（系统不预置任何默认阈值）', async () => {
    const total = await totalOf({
      name: '无上限成分',
      unit: 'mg',
      upperLimit: null,
      perServing: 999_999,
    })
    expect(total.upperLimit).toBeNull()
    expect(exceedsUpperLimit(total)).toBe(false)
  })

  it('低于上限 → 不标红', async () => {
    const total = await totalOf({ name: '低于', unit: 'mg', upperLimit: 40, perServing: 15 })
    expect(total.displayValue).toBe(15)
    expect(exceedsUpperLimit(total)).toBe(false)
  })

  it('**等于**上限 → 不算超过（边界不算超）', async () => {
    const total = await totalOf({ name: '相等', unit: 'mg', upperLimit: 40, perServing: 40 })
    expect(total.total).toBe(40_000)
    expect(total.upperLimit).toBe(40)
    expect(exceedsUpperLimit(total)).toBe(false)
  })

  it('高于上限 → 标红（mg：合计 30 mg > 上限 20 mg）', async () => {
    const total = await totalOf({ name: '超出', unit: 'mg', upperLimit: 20, perServing: 30 })
    expect(exceedsUpperLimit(total)).toBe(true)
  })

  it('界面显示为 1 mg 但内部是 1000 μg，仍按同单位比较得出「相等不超限」', async () => {
    // 这条正是「换算写错就会漏」的地方：直接拿 displayValue(1) 比 upperLimit(1) 会凑巧对，
    // 但拿 total(1000) 比 upperLimit(1) 就必然误报。函数必须自己归一。
    const total = await totalOf({ name: '一毫克', unit: 'mg', upperLimit: 1, perServing: 1 })
    expect(total.total).toBe(1000)
    expect(total.displayValue).toBe(1)
    expect(total.displayUnit).toBe('mg')
    expect(exceedsUpperLimit(total)).toBe(false)

    const over = await totalOf({ name: '两毫克', unit: 'mg', upperLimit: 1, perServing: 2 })
    expect(over.total).toBe(2000)
    expect(over.displayValue).toBe(2)
    expect(exceedsUpperLimit(over)).toBe(true)
  })

  it('μg 成分同样按 μg 比较（上限 500 μg、每份 600 μg → 超）', async () => {
    const total = await totalOf({ name: '微克', unit: 'μg', upperLimit: 500, perServing: 600 })
    expect(total.displayUnit).toBe('μg')
    expect(exceedsUpperLimit(total)).toBe(true)
  })

  it('IU 不走重量换算，直接按原值比较', async () => {
    const under = await totalOf({ name: '未超IU', unit: 'IU', upperLimit: 4000, perServing: 1000 })
    expect(exceedsUpperLimit(under)).toBe(false)

    const over = await totalOf({ name: '超出IU', unit: 'IU', upperLimit: 800, perServing: 1400 })
    expect(over.total).toBe(1400)
    expect(exceedsUpperLimit(over)).toBe(true)
  })

  it('追加一次（多一条 taken 记录）会把合计推过上限', async () => {
    const supplement = await seedSupplement()
    const zinc = await seedIngredient({ name: '锌', unit: 'mg', upperLimit: 20 })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: zinc.id,
      amountPerServing: 15,
    })
    await seedIntake({ date: DATE, supplementId: supplement.id, amount: 1, taken: true })
    expect(exceedsUpperLimit((await summarizeDate(DATE))[0])).toBe(false)

    // 追加一次：同日同补剂再一条 taken 记录（与 appendIntake 等价）
    await seedIntake({
      date: DATE,
      supplementId: supplement.id,
      amount: 1,
      taken: true,
      origin: 'extra',
      isExtra: true,
    })

    const total = (await summarizeDate(DATE))[0]
    expect(total.total).toBe(30_000)
    expect(exceedsUpperLimit(total)).toBe(true)
  })
})

/**
 * 每日成分汇总（计划口径，T-305 / 2026-09-22 用户裁决）。
 *
 * 关键区别：**不读打卡记录**。summarizePlannedDate 统计的是「今天按启用计划该摄入多少」，
 * 与 summarizeDate（实际摄入口径）撞名是经过确认的——首页/日历保持实际口径，
 * 只有成分库新增卡用计划口径。
 */
describe('每日成分汇总 · 计划口径（只记录计划数据）', () => {
  /** 造「计划每天吃 1 粒 D3 → 每份 1000 IU → 今日计划 1000 IU」的最小场景 */
  async function seedDailyD3() {
    const supplement = await seedSupplement({ name: '维生素 D3 胶囊' })
    const d3 = await seedIngredient({ name: '维生素 D3', unit: 'IU', recommendedDailyIntake: 800 })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: d3.id,
      amountPerServing: 1000,
    })
    await seedPlan(supplement.id)
    return { supplement, d3 }
  }

  it('没有启用计划 → 空数组（不读任何打卡记录）', async () => {
    expect(await summarizePlannedDate(DATE)).toEqual([])
  })

  it('启用计划 + 配方 → 今日计划 = 每次量 × 时段数 × 配方每份含量', async () => {
    await seedDailyD3()

    const totals = await summarizePlannedDate(DATE)

    expect(totals).toHaveLength(1)
    expect(totals[0].name).toBe('维生素 D3')
    expect(totals[0].total).toBe(1000)
    expect(totals[0].displayValue).toBe(1000)
    expect(totals[0].displayUnit).toBe('IU')
    // 参考摄入量是成分自填的，原样带出（计划口径不改变它）
    expect(totals[0].recommendedDailyIntake).toBe(800)
  })

  it('多时段 × 每次量：早+晚各 2 粒、每份 1000 IU → 今日计划 4000 IU', async () => {
    const supplement = await seedSupplement()
    const d3 = await seedIngredient({ unit: 'IU' })
    await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: d3.id,
      amountPerServing: 1000,
    })
    await seedPlan(supplement.id, { amountPerTime: 2, timeSlots: ['morning', 'evening'] })

    const total = (await summarizePlannedDate(DATE))[0]
    expect(total.total).toBe(4000)
  })

  it('已打卡**不改变**计划量 —— 计划口径只看计划，不看实际', async () => {
    const { supplement } = await seedDailyD3()
    // 今天已经打卡（实际口径会算它，计划口径仍按计划的 1 粒算）
    await seedIntake({ date: DATE, supplementId: supplement.id, amount: 1, taken: true })

    const total = (await summarizePlannedDate(DATE))[0]
    expect(total.total).toBe(1000)
  })

  it('暂停中（区间停药）→ 不计入今日计划', async () => {
    const { supplement } = await seedDailyD3()
    const now = nowIso()
    await db.pausePeriods.add({
      id: newId(),
      supplementId: supplement.id,
      schemeId: null,
      startDate: DATE,
      endDate: DATE,
      reason: '旅行',
      createdAt: now,
      updatedAt: now,
    })

    expect(await summarizePlannedDate(DATE)).toEqual([])
  })

  it('间隔天节奏：当天是休息日 → 不计入；当天该吃 → 计入', async () => {
    const { supplement } = await seedDailyD3()
    // 吃 1 停 1，锚点 = 前一天 → DATE 是休息日
    await db.dosagePlans.clear()
    await seedPlan(supplement.id, {
      rateMode: 'cyclic',
      rateOnDays: 1,
      rateOffDays: 1,
      rateAnchorDate: DAY_BEFORE,
    })

    expect(await summarizePlannedDate(DATE)).toEqual([])

    // 锚点 = DATE → 当天该吃 → 计入
    await db.dosagePlans.clear()
    await seedPlan(supplement.id, {
      rateMode: 'cyclic',
      rateOnDays: 1,
      rateOffDays: 1,
      rateAnchorDate: DATE,
    })

    const total = (await summarizePlannedDate(DATE))[0]
    expect(total.total).toBe(1000)
  })

  it('计划口径同样遵守「当日有效配方」：改配方后按新配方算', async () => {
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
    await seedPlan(supplement.id)

    const total = (await summarizePlannedDate(DATE))[0]
    expect(total.total).toBe(2000)
  })
})
