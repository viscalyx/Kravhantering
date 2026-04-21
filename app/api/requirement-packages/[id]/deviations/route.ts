import { type NextRequest, NextResponse } from 'next/server'
import {
  countDeviationsByPackage,
  listDeviationsForPackage,
} from '@/lib/dal/deviations'
import {
  getPackageById,
  getPackageBySlug,
} from '@/lib/dal/requirement-packages'
import type { SqlServerDatabase } from '@/lib/db'
import { getRequestSqlServerDataSource } from '@/lib/db'

type Params = Promise<{ id: string }>

async function resolvePackageId(
  db: SqlServerDatabase,
  idOrSlug: string,
): Promise<number | null> {
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

  const packageId = await resolvePackageId(db, id)
  if (packageId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const deviations = await listDeviationsForPackage(db, packageId)
  const counts = await countDeviationsByPackage(db, packageId)

  return NextResponse.json({ counts, deviations })
}
