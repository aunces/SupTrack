import { z } from 'zod'

/** 未删除为 0，已删除为 ISO 时间字符串。禁止 null / undefined */
export const DeletedAtSchema = z.union([z.literal(0), z.string().datetime()])

/** YYYY-MM-DD */
export const IsoDateSchema = z.string().date()

/** ISO 时间字符串 */
export const IsoDateTimeSchema = z.string().datetime()

/** 所有数量字段一律整数 */
export const IntSchema = z.number().int()

export const NullableIntSchema = z.number().int().nullable()

export const UuidSchema = z.string().uuid()

export const NullableTextSchema = z.string().nullable()

export const OptionalNullableTextSchema = z.string().nullable().optional()

export const OptionalNullableIntSchema = z.number().int().nullable().optional()

export const OptionalNullableDateSchema = IsoDateSchema.nullable().optional()
