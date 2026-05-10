import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getSpecificationById,
  getSpecificationBySlug,
  listSpecificationNeedsReferences,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  parseRouteParams,
  specificationIdOrSlugSchema,
} from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const specificationParamSchema = z
  .object({
    id: specificationIdOrSlugSchema,
  })
  .strict()

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
  const parsedParams = await parseRouteParams(params, specificationParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const { id } = parsedParams.data
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
