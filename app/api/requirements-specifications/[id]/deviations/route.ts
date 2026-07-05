import { type NextRequest, NextResponse } from 'next/server'
import {
  countDeviationsBySpecification,
  listDeviationsForSpecification,
} from '@/lib/dal/deviations'
import { getSpecificationById } from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { idParamSchema, parseRouteParams } from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const specificationParamSchema = idParamSchema

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

  const specification = await getSpecificationById(db, id)
  if (!specification) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const deviations = await listDeviationsForSpecification(db, specification.id)
  const counts = await countDeviationsBySpecification(db, specification.id)

  return NextResponse.json({ counts, deviations })
}
