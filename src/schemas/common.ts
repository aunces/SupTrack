import { z } from 'zod'

/**
 * 通用校验基元（实施指导书 §5.5）。
 *
 * 已移除 DeletedAtSchema：新模型是硬删除，没有软删除字段（R-04）。
 * 「Update 全部字段 optional」由各实体自行 `.optional()`，不再单独提供 OptionalXxx 基元。
 */

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
