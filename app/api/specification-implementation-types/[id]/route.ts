import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded,
} from '@/lib/admin/privileged-audit'
import {
  deleteSpecificationImplementationType,
  updateSpecificationImplementationType,
} from '@/lib/dal/specification-implementation-types'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  idParamSchema,
  parseRouteParams,
  readJsonWithSchema,
} from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const updateImplementationTypeSchema = z
  .object({
    nameEn: boundedDbStringSchema.optional(),
    nameSv: boundedDbStringSchema.optional(),
  })
  .strict()
  .refine(data => data.nameEn !== undefined || data.nameSv !== undefined, {
    message: 'At least one of nameEn or nameSv must be provided',
  })

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(
    request,
    updateImplementationTypeSchema,
  )
  if (!parsedBody.ok) return parsedBody.response
  const auditContext = await createAdminPrivilegedAuditContext(request)
  const db = await getRequestSqlServerDataSource()
  const type = await updateSpecificationImplementationType(
    db,
    parsedParams.data.id,
    parsedBody.data,
  )
  if (!type) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  recordAdminPrivilegedActionSucceeded(auditContext, {
    changedFields: Object.keys(parsedBody.data),
    operation: 'update',
    resourceId: parsedParams.data.id,
    resourceType: 'specification_implementation_type',
  })
  return NextResponse.json(type)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const auditContext = await createAdminPrivilegedAuditContext(request)
  const db = await getRequestSqlServerDataSource()
  const deletedCount = await deleteSpecificationImplementationType(
    db,
    parsedParams.data.id,
  )
  if (deletedCount === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  recordAdminPrivilegedActionSucceeded(auditContext, {
    operation: 'delete',
    resourceId: parsedParams.data.id,
    resourceType: 'specification_implementation_type',
  })
  return NextResponse.json({ ok: true })
}
