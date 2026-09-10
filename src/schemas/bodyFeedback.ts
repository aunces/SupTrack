import { z } from 'zod'
import {
  DeletedAtSchema,
  IntSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  NullableTextSchema,
  UuidSchema,
} from './common'

const ScoreSchema = IntSchema.min(1).max(5)

export const BodyFeedbackCreateSchema = z.object({
  id: UuidSchema,
  date: IsoDateSchema,
  energy: ScoreSchema,
  sleep: ScoreSchema,
  digestion: ScoreSchema,
  mood: ScoreSchema,
  notes: NullableTextSchema,
  deletedAt: DeletedAtSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
})

export const BodyFeedbackUpdateSchema = z.object({
  date: IsoDateSchema.optional(),
  energy: ScoreSchema.optional(),
  sleep: ScoreSchema.optional(),
  digestion: ScoreSchema.optional(),
  mood: ScoreSchema.optional(),
  notes: NullableTextSchema.optional(),
  deletedAt: DeletedAtSchema.optional(),
  updatedAt: IsoDateTimeSchema.optional(),
})

export type BodyFeedbackCreateInput = z.infer<typeof BodyFeedbackCreateSchema>
export type BodyFeedbackUpdateInput = z.infer<typeof BodyFeedbackUpdateSchema>
