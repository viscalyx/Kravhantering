import { NextResponse } from 'next/server'
import { listTypes } from '@/lib/dal/requirement-types'
import { getRequestSqlServerDataSource } from '@/lib/db'

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const types = await listTypes(db)
  return NextResponse.json({ types })
}
