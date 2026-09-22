import { describe, expect, it } from 'vitest'
import type { IngredientUnit } from '@/constants/units'
import { groupTotalsBySource, type IngredientTotal } from '@/utils/summary'

/**
 * 批量成分分组（§8.4 设计 3:318，日历页）。★ 纯函数，不装 db ——
 * 输入是现成的 IngredientTotal，直接构造对象测换算与归并。
 *
 * 重量类来源在 `IngredientTotal.unit` 原始单位下（生存源是 computeIngredientTotals
 * 的 sourceAmounts，**并非** μg），组内再按与「总值展示」相同的换算逻辑逐来源转展示单位。
 */
function makeTotal(o: {
  ingredientId: string
  name: string
  unit: IngredientUnit
  sources: IngredientTotal['sources']
}): IngredientTotal {
  return {
    ingredientId: o.ingredientId,
    name: o.name,
    unit: o.unit,
    total: 0,
    displayValue: 0,
    displayUnit: o.unit,
    recommendedDailyIntake: null,
    upperLimit: null,
    sources: o.sources,
    hasDeletedSupplement: false,
    missingRecipe: false,
  }
}

function src(supplementName: string, amount: number) {
  return { supplementId: supplementName, supplementName, amount }
}

describe('groupTotalsBySource · 把成分来源按补剂归组', () => {
  it('同一补剂为 ≥2 种成分贡献 → 归为一组，组内按出现顺序、重量从 μg/mg 正确换算', () => {
    const groups = groupTotalsBySource([
      makeTotal({
        ingredientId: 'vit-a',
        name: '维生素A',
        unit: 'μg',
        sources: [src('复合维生素', 900)],
      }),
      makeTotal({
        ingredientId: 'vit-c',
        name: '维生素C',
        unit: 'mg',
        sources: [src('复合维生素', 60)],
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].supplementName).toBe('复合维生素')
    expect(groups[0].itemCount).toBe(2)
    expect(groups[0].items).toEqual([
      expect.objectContaining({
        ingredientId: 'vit-a',
        name: '维生素A',
        value: 900,
        displayUnit: 'μg',
      }),
      expect.objectContaining({
        ingredientId: 'vit-c',
        name: '维生素C',
        value: 60,
        displayUnit: 'mg',
      }),
    ])
  })

  it('单成分补剂（items.length < 2）被剔除，不渲染该组', () => {
    const groups = groupTotalsBySource([
      // 只有 D3 一个成分 → 该补剂组会被剔除
      makeTotal({
        ingredientId: 'd3',
        name: '维生素D3',
        unit: 'IU',
        sources: [src('单方D3', 1000)],
      }),
      // 复合补剂有两个成分 → 保留
      makeTotal({ ingredientId: 'cal', name: '钙', unit: 'mg', sources: [src('复合', 500)] }),
      makeTotal({ ingredientId: 'mg2', name: '镁', unit: 'mg', sources: [src('复合', 200)] }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].supplementName).toBe('复合')
    expect(groups[0].itemCount).toBe(2)
  })

  it('IU / ml 不做重量换算，原样带出', () => {
    const groups = groupTotalsBySource([
      makeTotal({
        ingredientId: 'd3',
        name: '维生素D3',
        unit: 'IU',
        sources: [src('复合', 1000)],
      }),
      makeTotal({ ingredientId: 'liq', name: '某液体成分', unit: 'ml', sources: [src('复合', 5)] }),
    ])

    expect(groups[0].items).toEqual([
      expect.objectContaining({ value: 1000, displayUnit: 'IU' }),
      expect.objectContaining({ value: 5, displayUnit: 'ml' }),
    ])
  })

  it('同一成分被多个补剂贡献 → 各补剂各得一项，它本身是复合配方时照常分组', () => {
    const groups = groupTotalsBySource([
      // D3 来自单方补剂 + 复合补剂
      makeTotal({
        ingredientId: 'd3',
        name: '维生素D3',
        unit: 'IU',
        sources: [src('单方D3', 1000), src('复合', 400)],
      }),
      makeTotal({ ingredientId: 'cal', name: '钙', unit: 'mg', sources: [src('复合', 500)] }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].supplementName).toBe('复合')
    expect(groups[0].items).toHaveLength(2)
    const d3Item = groups[0].items.find((i) => i.name === '维生素D3')!
    expect(d3Item.value).toBe(400)
    expect(d3Item.displayUnit).toBe('IU')
  })

  it('空输入 → 空数组', () => {
    expect(groupTotalsBySource([])).toEqual([])
  })

  it('多个批量组按补剂名（中文）排序', () => {
    const groups = groupTotalsBySource([
      makeTotal({ ingredientId: 'b1', name: '成分B', unit: 'mg', sources: [src('贝塔复合', 10)] }),
      makeTotal({ ingredientId: 'b2', name: '成分B2', unit: 'mg', sources: [src('贝塔复合', 20)] }),
      makeTotal({ ingredientId: 'a1', name: '成分A', unit: 'mg', sources: [src('阿尔法复合', 5)] }),
      makeTotal({
        ingredientId: 'a2',
        name: '成分A2',
        unit: 'mg',
        sources: [src('阿尔法复合', 8)],
      }),
    ])

    // 中文 localeCompare 排序：阿尔法（ā）< 贝塔（bèi）
    expect(groups.map((g) => g.supplementName)).toEqual(['阿尔法复合', '贝塔复合'])
  })
})
