import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import {
  addLink,
  changeRecipe,
  countLinks,
  createIngredient,
  listSources,
  removeLink,
  updateIngredient,
} from '@/services/ingredientService'
import type { IngredientUnit } from '@/constants/units'
import { addDays, today } from '@/utils/date'
import { resetDb, seedIngredient, seedIngredientLink, seedSupplement } from '../helpers/db'

/**
 * 成分与配方写入（§8.5 / T-303 / T-310）。
 *
 * 核心是「改配方不修改原记录」—— 这条一旦写错，用户上个月的数字会跟着今天的改动变。
 */
const TODAY = today()
const YESTERDAY = addDays(TODAY, -1)

beforeEach(async () => {
  await resetDb()
})

describe('createIngredient / updateIngredient', () => {
  it('系统不预置任何默认阈值：参考值与上限默认都是 null', async () => {
    const created = await createIngredient({
      name: '维生素 D3',
      unit: 'IU',
      recommendedDailyIntake: null,
      upperLimit: null,
      notes: null,
    })

    expect(created.recommendedDailyIntake).toBeNull()
    expect(created.upperLimit).toBeNull()
    expect(await db.ingredients.count()).toBe(1)
  })

  it('用户输入 mcg → 存储统一为 μg（MCG_ALIAS）', async () => {
    const created = await createIngredient({
      name: '维生素 B12',
      // 类型上只允许 5 个规范单位；mcg 只可能从手写 / 导入进来，schema 负责归一
      unit: 'mcg' as IngredientUnit,
      recommendedDailyIntake: null,
      upperLimit: null,
      notes: null,
    })

    expect(created.unit).toBe('μg')
  })

  it('更新只改传入的字段，名称可改（关联走 ingredientId，不受影响）', async () => {
    const supplement = await seedSupplement()
    const ingredient = await seedIngredient({ name: '旧名' })
    await seedIngredientLink({ supplementId: supplement.id, ingredientId: ingredient.id })

    await updateIngredient(ingredient.id, {
      name: '新名',
      unit: ingredient.unit,
      recommendedDailyIntake: 800,
      upperLimit: 4000,
      notes: '随餐',
    })

    const stored = await db.ingredients.get(ingredient.id)
    expect(stored?.name).toBe('新名')
    expect(stored?.recommendedDailyIntake).toBe(800)
    // 关联没动
    expect(await countLinks(ingredient.id)).toBe(1)
  })

  it('更新不存在的成分抛错', async () => {
    await expect(
      updateIngredient('not-exist', {
        name: 'x',
        unit: 'mg',
        recommendedDailyIntake: null,
        upperLimit: null,
        notes: null,
      }),
    ).rejects.toThrow(/成分不存在/)
  })
})

describe('addLink / removeLink', () => {
  it('新增配方即刻生效（effectiveFrom = 今天、effectiveTo 为空）', async () => {
    const supplement = await seedSupplement()
    const ingredient = await seedIngredient({ unit: 'IU' })

    const link = await addLink({
      supplementId: supplement.id,
      ingredientId: ingredient.id,
      amountPerServing: 1000,
    })

    expect(link.effectiveFrom).toBe(TODAY)
    expect(link.effectiveTo).toBeNull()
    expect(await db.supplementIngredients.count()).toBe(1)
  })

  it('移除关联是硬删除（填错了就该能改，history 场景走 changeRecipe）', async () => {
    const supplement = await seedSupplement()
    const ingredient = await seedIngredient()
    const link = await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: ingredient.id,
    })

    await removeLink(link.id)

    expect(await db.supplementIngredients.count()).toBe(0)
  })
})

describe('changeRecipe · 改配方留痕（走查第 20 步）', () => {
  it('原记录失效于昨天、新记录今天生效，含量按新值', async () => {
    const supplement = await seedSupplement()
    const ingredient = await seedIngredient({ unit: 'IU' })
    const oldLink = await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: ingredient.id,
      amountPerServing: 1000,
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    })

    await changeRecipe(oldLink.id, 2000)

    const rows = await db.supplementIngredients.toArray()
    expect(rows).toHaveLength(2)

    const oldRow = rows.find((row) => row.id === oldLink.id)
    const newRow = rows.find((row) => row.id !== oldLink.id)

    // 原记录只被「封口」，含量一个数字都没动
    expect(oldRow?.amountPerServing).toBe(1000)
    expect(oldRow?.effectiveTo).toBe(YESTERDAY)
    expect(oldRow?.effectiveFrom).toBe('2026-09-01')

    expect(newRow?.amountPerServing).toBe(2000)
    expect(newRow?.effectiveFrom).toBe(TODAY)
    expect(newRow?.effectiveTo).toBeNull()
  })

  it('今天才建的配方直接就地改，不留一条「今天起、今天止」的空区间', async () => {
    const supplement = await seedSupplement()
    const ingredient = await seedIngredient({ unit: 'IU' })
    const link = await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: ingredient.id,
      amountPerServing: 1000,
      effectiveFrom: TODAY,
      effectiveTo: null,
    })

    await changeRecipe(link.id, 500)

    const rows = await db.supplementIngredients.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].amountPerServing).toBe(500)
    expect(rows[0].effectiveTo).toBeNull()
  })

  it('已失效的配方不能再改（会悄悄改写历史）', async () => {
    const supplement = await seedSupplement()
    const ingredient = await seedIngredient()
    const link = await seedIngredientLink({
      supplementId: supplement.id,
      ingredientId: ingredient.id,
      effectiveFrom: '2026-08-01',
      effectiveTo: '2026-08-31',
    })

    await expect(changeRecipe(link.id, 999)).rejects.toThrow(/已失效/)
    expect((await db.supplementIngredients.get(link.id))?.amountPerServing).toBe(1000)
  })

  it('改不存在的配方抛错', async () => {
    await expect(changeRecipe('not-exist', 100)).rejects.toThrow(/配方不存在/)
  })
})

describe('listSources · 来源追溯', () => {
  it('列出包含该成分的补剂，含已失效配方，并标记是否当前有效', async () => {
    const current = await seedSupplement({ name: '复合维生素' })
    const past = await seedSupplement({ name: '旧的那瓶' })
    const d3 = await seedIngredient({ name: '维生素 D3', unit: 'IU' })
    await seedIngredientLink({
      supplementId: current.id,
      ingredientId: d3.id,
      amountPerServing: 400,
      effectiveFrom: '2026-09-15',
      effectiveTo: null,
    })
    await seedIngredientLink({
      supplementId: past.id,
      ingredientId: d3.id,
      amountPerServing: 1000,
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-09-14',
    })

    const sources = await listSources(d3.id)

    expect(sources).toHaveLength(2)
    expect(sources.map((s) => s.supplementName).sort()).toEqual(['复合维生素', '旧的那瓶'])
    expect(sources.find((s) => s.supplementName === '复合维生素')?.isCurrent).toBe(true)
    expect(sources.find((s) => s.supplementName === '旧的那瓶')?.isCurrent).toBe(false)
  })

  it('补剂被删掉后来源仍可追溯，名字显示为「[已删除的补剂]」', async () => {
    const d3 = await seedIngredient({ unit: 'IU' })
    await seedIngredientLink({ supplementId: 'ghost', ingredientId: d3.id })

    const sources = await listSources(d3.id)
    expect(sources[0].supplementName).toBe('[已删除的补剂]')
  })
})
