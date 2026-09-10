/** 未删除哨兵值。IndexedDB 不索引 null，故用 0，保证 [deletedAt+date] 等复合索引可命中 */
export const NOT_DELETED = 0 as const

export type DeletedAt = 0 | string

export function isDeleted(value: DeletedAt): boolean {
  return value !== NOT_DELETED
}
