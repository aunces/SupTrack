import { db } from '@/db'
import { IngredientCreateSchema, IngredientUpdateSchema } from '@/schemas/ingredient'
import type { IngredientCreateInput, IngredientUpdateInput } from '@/schemas/ingredient'
import type { Ingredient } from '@/types'
import { nowIso } from '@/utils/id'
import { createRepository } from './base'

const base = createRepository<Ingredient>(db.ingredients)

export const ingredientRepository = {
  ...base,

  async create(input: IngredientCreateInput): Promise<Ingredient> {
    const record = IngredientCreateSchema.parse(input) as Ingredient
    return base.insert(record)
  },

  async update(id: string, patch: IngredientUpdateInput): Promise<void> {
    const parsed = IngredientUpdateSchema.parse(patch)
    await base.update(id, { ...parsed, updatedAt: nowIso() } as Partial<Ingredient>)
  },

  async findByName(name: string): Promise<Ingredient | undefined> {
    const rows = await db.ingredients.where('name').equals(name).toArray()
    return rows[0]
  },

  /** 来源追溯：该成分被哪些补剂包含（含已失效配方，用户需要看到「改过配方」） */
  async listSupplements(ingredientId: string) {
    return db.supplementIngredients.where('ingredientId').equals(ingredientId).toArray()
  },
}
