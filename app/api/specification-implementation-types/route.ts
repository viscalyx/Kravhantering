import { NextResponse } from 'next/server'
import {
  createSpecificationImplementationType,
  listSpecificationImplementationTypes,
} from '@/lib/dal/specification-implementation-types'
import { getRequestSqlServerDataSource } from '@/lib/db'

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const types = await listSpecificationImplementationTypes(db)
  return NextResponse.json({ types })
}

export async function POST(request: Request) {
  const db = await getRequestSqlServerDataSource()
  const body = (await request.json()) as Parameters<
    typeof createSpecificationImplementationType
  >[1]
  const type = await createSpecificationImplementationType(db, body)
  return NextResponse.json(type, { status: 201 })
}
