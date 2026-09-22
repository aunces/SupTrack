import { db } from '@/db'

/**
 * 数据统计（T-308）。
 *
 * 只是「各表有几条」—— 让用户在清空/导入之前对数据规模有个概念。
 * **不做**任何图表、趋势、达成率：需求 §8.2 明确统计图表是最低优先级，
 * 删掉它不影响任何功能（T-311 默认跳过）。
 *
 * 放在 service 层而不是页面里直接 count，是为了守住「页面不碰 db」的约定（§4.2）。
 */

export interface TableCount {
  label: string
  count: number
}

export async function tableCounts(): Promise<TableCount[]> {
  const [
    supplements,
    dosagePlans,
    dailyIntakes,
    pausePeriods,
    pauseSchemes,
    ingredients,
    supplementIngredients,
  ] = await Promise.all([
    db.supplements.count(),
    db.dosagePlans.count(),
    db.dailyIntakes.count(),
    db.pausePeriods.count(),
    db.pauseSchemes.count(),
    db.ingredients.count(),
    db.supplementIngredients.count(),
  ])

  return [
    { label: '补剂', count: supplements },
    { label: '服用计划', count: dosagePlans },
    { label: '服用记录', count: dailyIntakes },
    { label: '停药条目', count: pausePeriods },
    { label: '停药方案组', count: pauseSchemes },
    { label: '成分', count: ingredients },
    { label: '成分关联', count: supplementIngredients },
  ]
}
