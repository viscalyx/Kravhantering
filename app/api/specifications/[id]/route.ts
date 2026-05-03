import { type NextRequest, NextResponse } from 'next/server'
import {
  deletePackage,
  getPackageById,
  getPackageBySlug,
  isSlugTaken,
  updatePackage,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { getRequestSqlServerDataSource } from '@/lib/db'

type Params = Promise<{ id: string }>

async function resolvePackage(db: SqlServerDatabase, idOrSlug: string) {
  if (/^\d+$/.test(idOrSlug)) return getPackageById(db, Number(idOrSlug))
  return getPackageBySlug(db, idOrSlug)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const db = await getRequestSqlServerDataSource()
  const pkg = await resolvePackage(db, id)
  if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(pkg)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const db = await getRequestSqlServerDataSource()

  const pkg = await resolvePackage(db, id)
  if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await request.json()) as {
    businessNeedsReference?: string | null
    name?: string
    specificationImplementationTypeId?: number | null
    specificationLifecycleStatusId?: number | null
    specificationResponsibilityAreaId?: number | null
    uniqueId?: string
  }

  if (body.uniqueId && (await isSlugTaken(db, body.uniqueId, pkg.id))) {
    return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
  }

  const updated = await updatePackage(db, pkg.id, body)
  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const db = await getRequestSqlServerDataSource()
  const pkg = await resolvePackage(db, id)
  if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await deletePackage(db, pkg.id)
  return NextResponse.json({ ok: true })
}
