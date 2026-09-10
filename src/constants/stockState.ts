export const STOCK_STATE = {
  DEDUCTED: 'deducted', // 已扣库存，未软删除
  NOT_DEDUCTED: 'not_deducted', // 未扣库存，未软删除或软删除后保持
  WAS_DEDUCTED: 'was_deducted', // 曾扣过库存，软删除时已回滚，恢复时需重扣
  UNKNOWN: 'unknown', // v3 及更早迁移遗留，恢复时用户二选一
} as const

export type StockState = (typeof STOCK_STATE)[keyof typeof STOCK_STATE]

export const STOCK_STATE_LABEL: Record<StockState, string> = {
  deducted: '已扣库存',
  not_deducted: '未扣库存',
  was_deducted: '曾扣库存（已回滚）',
  unknown: '库存状态未知',
}

export const STOCK_STATE_VALUES = Object.values(STOCK_STATE) as [StockState, ...StockState[]]
