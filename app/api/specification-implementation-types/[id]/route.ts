import { type NextRequest, NextResponse } from 'next/server'
import {
  deleteSpecificationImplementationType,
  updateSpecificationImplementationType,
} from '@/lib/dal/specification-implementation-types'
import { getRequestSqlServerDataSource } from '@/lib/db'

type Params = Promise<{ id: string }>

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const db = await getRequestSqlServerDataSource()
  const body = (await request.json()) as Parameters<
    typeof updateSpecificationImplementationType
  >[2]
  const type = await updateSpecificationImplementationType(db, Number(id), body)
  return NextResponse.json(type)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const db = await getRequestSqlServerDataSource()
  await deleteSpecificationImplementationType(db, Number(id))
  return NextResponse.json({ ok: true })
}
