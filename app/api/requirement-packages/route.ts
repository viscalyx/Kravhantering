import { type NextRequest, NextResponse } from 'next/server'
import {
  createPackage,
  isSlugTaken,
  listPackages,
} from '@/lib/dal/requirement-packages'
import { getRequestSqlServerDataSource } from '@/lib/db'

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const packages = await listPackages(db)
  return NextResponse.json({ packages })
}

export async function POST(request: NextRequest) {
  const db = await getRequestSqlServerDataSource()
  const body = (await request.json()) as Parameters<typeof createPackage>[1]

  if (
    !body?.uniqueId ||
    typeof body.uniqueId !== 'string' ||
    !body.uniqueId.trim()
  ) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  if (await isSlugTaken(db, body.uniqueId)) {
    return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
  }

  const pkg = await createPackage(db, body)
  return NextResponse.json(pkg, { status: 201 })
}
