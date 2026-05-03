import { type NextRequest, NextResponse } from 'next/server'
import {
  getPackageById,
  getPackageBySlug,
  listSpecificationNeedsReferences,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { getRequestSqlServerDataSource } from '@/lib/db'

type Params = Promise<{ id: string }>

async function resolvePackageId(db: SqlServerDatabase, idOrSlug: string) {
  if (/^\d+$/.test(idOrSlug)) {
    const pkg = await getPackageById(db, Number(idOrSlug))
    return pkg?.id ?? null
  }
  const pkg = await getPackageBySlug(db, idOrSlug)
  return pkg?.id ?? null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const db = await getRequestSqlServerDataSource()
  const specificationId = await resolvePackageId(db, id)
  if (specificationId === null)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const needsReferences = await listSpecificationNeedsReferences(
    db,
    specificationId,
  )
  return NextResponse.json({ needsReferences })
}
