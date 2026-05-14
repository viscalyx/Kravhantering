import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  deleteRiskLevel,
  getLinkedRequirements,
  getRiskLevelById,
  updateRiskLevel,
} from '@/lib/dal/risk-levels'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  idParamSchema,
  nonNegativeIntegerSchema,
  parseRouteParams,
} from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const updateRiskLevelSchema = z
  .object({
    color: boundedDbStringSchema.optional(),
    nameEn: boundedDbStringSchema.optional(),
    nameSv: boundedDbStringSchema.optional(),
    sortOrder: nonNegativeIntegerSchema.optional(),
  })
  .strict()

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const { id } = parsedParams.data
  const db = await getRequestSqlServerDataSource()
  const [riskLevel, linkedRequirements] = await Promise.all([
    getRiskLevelById(db, id),
    getLinkedRequirements(db, id),
  ])
  if (!riskLevel) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ riskLevel, linkedRequirements })
}

export const PUT = secureMutationRoute({
  bodySchema: updateRiskLevelSchema,
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const riskLevel = await updateRiskLevel(db, params.id, body)
    if (!riskLevel) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'update',
      resourceId: params.id,
      resourceType: 'risk_level',
    })
    return NextResponse.json(riskLevel)
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const deletedCount = await deleteRiskLevel(db, params.id)
    if (deletedCount === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    recordAdminPrivilegedActionSucceeded(context, {
      operation: 'delete',
      resourceId: params.id,
      resourceType: 'risk_level',
    })
    return NextResponse.json({ ok: true })
  },
})
