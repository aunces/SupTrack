export const UNIT_TYPE = {
  CAPSULE: 'capsule', // 胶囊
  TABLET: 'tablet', // 片
  PILL: 'pill', // 粒 / 丸
  GRANULE: 'granule', // 颗粒
  BAG: 'bag', // 袋
  STICK: 'stick', // 支
  ML: 'ml', // 毫升
  G: 'g', // 克
  SCOOP: 'scoop', // 勺
  DROP: 'drop', // 滴
} as const

export type UnitType = (typeof UNIT_TYPE)[keyof typeof UNIT_TYPE]

export const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  capsule: '胶囊',
  tablet: '片',
  pill: '粒',
  granule: '颗粒',
  bag: '袋',
  stick: '支',
  ml: 'ml',
  g: 'g',
  scoop: '勺',
  drop: '滴',
}

export const UNIT_TYPE_VALUES = Object.values(UNIT_TYPE) as [UnitType, ...UnitType[]]

export const INGREDIENT_UNIT = {
  MG: 'mg',
  MCG: 'μg', // 存储统一用 μg，不存 mcg
  G: 'g',
  IU: 'IU',
  ML: 'ml',
} as const

export type IngredientUnit = (typeof INGREDIENT_UNIT)[keyof typeof INGREDIENT_UNIT]

export const INGREDIENT_UNIT_LABEL: Record<IngredientUnit, string> = {
  mg: 'mg',
  μg: 'μg',
  g: 'g',
  IU: 'IU',
  ml: 'ml',
}

export const INGREDIENT_UNIT_VALUES = Object.values(INGREDIENT_UNIT) as [
  IngredientUnit,
  ...IngredientUnit[],
]

/** 用户输入 mcg 时统一转换为 μg */
export const MCG_ALIAS = 'mcg'

/** 重量类单位换算到 μg */
export const TO_MICROGRAM: Record<'mg' | 'μg' | 'g', number> = {
  μg: 1,
  mg: 1000,
  g: 1_000_000,
}
