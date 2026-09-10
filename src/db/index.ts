import { DB_NAME, SupTrackDB } from './schema'

export { DB_NAME, SupTrackDB }

export const db = new SupTrackDB(DB_NAME)
