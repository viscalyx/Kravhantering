import { type NextRequest, NextResponse } from 'next/server'
import {
  deleteSpecification,
  getSpecificationById,
  getSpecificationBySlug,
  isSlugTaken,
  updateSpecification,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { getRequestSqlServerDataSource } from '@/lib/db'

type Params = Promise<{ id: string }>

async function resolveSpecification(db: SqlServerDatabase, idOrSlug: string) {
  if (/^\d+$/.test(idOrSlug)) return getSpecificationById(db, Number(idOrSlug))
  return getSpecificationBySlug(db, idOrSlug)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const db = await getRequestSqlServerDataSource()
  const spec = await resolveSpecification(db, id)
  if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(spec)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const db = await getRequestSqlServerDataSource()

  const spec = await resolveSpecification(db, id)
  if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await request.json()) as {
    businessNeedsReference?: string | null
    name?: string
    specificationImplementationTypeId?: number | null
    specificationLifecycleStatusId?: number | null
    specificationResponsibilityAreaId?: number | null
    uniqueId?: string
  }

  if (body.uniqueId && (await isSlugTaken(db, body.uniqueId, spec.id))) {
    return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
  }

  const updated = await updateSpecification(db, spec.id, body)
  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const db = await getRequestSqlServerDataSource()
  const spec = await resolveSpecification(db, id)
  if (!spec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await deleteSpecification(db, spec.id)
  return NextResponse.json({ ok: true })
}
