import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import * as schema from '@/drizzle/schema'

export function getDb(d1: D1Database) {
  return drizzleD1(d1, { schema })
}

export type Database = ReturnType<typeof getDb>
