import { NextResponse } from 'next/server'
import { listCategories } from '@/lib/dal/requirement-categories'
import { getRequestSqlServerDataSource } from '@/lib/db'

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const categories = await listCategories(db)
  return NextResponse.json({ categories })
}
