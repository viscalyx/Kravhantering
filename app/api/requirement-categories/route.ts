import { NextResponse } from 'next/server'
import { listCategories } from '@/lib/dal/requirement-categories'
import { getRequestDatabaseConnection } from '@/lib/db'

export async function GET() {
  const db = await getRequestDatabaseConnection()
  const categories = await listCategories(db)
  return NextResponse.json({ categories })
}
