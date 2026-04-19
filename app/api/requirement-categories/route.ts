import { NextResponse } from 'next/server'
import { listCategories } from '@/lib/dal/requirement-categories'
import { getRequestDatabase } from '@/lib/db'

export async function GET() {
  const db = await getRequestDatabase()
  const categories = await listCategories(db)
  return NextResponse.json({ categories })
}
