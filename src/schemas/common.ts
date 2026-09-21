import { z } from 'zod'
import type { ZodTypeAny } from 'zod'

/**
 * 通用校验基元（实施指导书 §5.5）。
 *
 * 已移除 DeletedAtSchema：新模型是硬删除，没有软删除字段（R-04）。
 * 「Update 全部字段 optional」由各实体自行 `.optional()`，不再单独提供 OptionalXxx 基元。
 */

/**
 * 写入边界统一用这个，不要用 schema.parse。
 * ZodError.message 是一段 JSON，UI 会把它原样 toast 出来，用户看不懂；
 * 这里只取第一条 issue 的中文 message，抛普通 Error（§4.4：错误 message 直接用用户可读中文）。
 */
export function parseOrThrow<S extends ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? '数据校验未通过')
  }
  return result.data
}

/** YYYY-MM-DD */
export const IsoDateSchema = z.string().date()

/** ISO 时间字符串 */
export const IsoDateTimeSchema = z.string().datetime()

export const UuidSchema = z.string().uuid()

/** 所有数量字段一律整数（R-09） */
export const IntSchema = z.number().int()

/** 非负整数：含量、参考值、上限 */
export const NonNegIntSchema = z.number().int().nonnegative()

export const NullableIntSchema = z.number().int().nullable()

export const NullableTextSchema = z.string().nullable()
