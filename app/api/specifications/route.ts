import { type NextRequest, NextResponse } from 'next/server'
import {
  createSpecification,
  isSlugTaken,
  listSpecifications,
} from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const specifications = await listSpecifications(db)
  return NextResponse.json({ specifications })
}

export async function POST(request: NextRequest) {
  const db = await getRequestSqlServerDataSource()
  const body = (await request.json()) as Parameters<
    typeof createSpecification
  >[1]

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

  const spec = await createSpecification(db, body)
  return NextResponse.json(spec, { status: 201 })
}
