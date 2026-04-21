import { NextResponse } from 'next/server'
import { listOwners } from '@/lib/dal/owners'
import { getRequestSqlServerDataSource } from '@/lib/db'

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const owners = await listOwners(db)
  return NextResponse.json({ owners })
}
