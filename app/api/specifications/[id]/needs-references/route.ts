import { type NextRequest, NextResponse } from 'next/server'
import {
  getSpecificationById,
  getSpecificationBySlug,
  listSpecificationNeedsReferences,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { getRequestSqlServerDataSource } from '@/lib/db'

type Params = Promise<{ id: string }>

async function resolveSpecificationId(db: SqlServerDatabase, idOrSlug: string) {
  if (/^\d+$/.test(idOrSlug)) {
    const spec = await getSpecificationById(db, Number(idOrSlug))
    return spec?.id ?? null
  }
  const spec = await getSpecificationBySlug(db, idOrSlug)
  return spec?.id ?? null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const db = await getRequestSqlServerDataSource()
  const specificationId = await resolveSpecificationId(db, id)
  if (specificationId === null)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const needsReferences = await listSpecificationNeedsReferences(
    db,
    specificationId,
  )
  return NextResponse.json({ needsReferences })
}
