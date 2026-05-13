import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded,
} from '@/lib/admin/privileged-audit'
import {
  deleteSpecificationResponsibilityArea,
  updateSpecificationResponsibilityArea,
} from '@/lib/dal/specification-responsibility-areas'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  idParamSchema,
  parseRouteParams,
  readJsonWithSchema,
} from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const updateResponsibilityAreaSchema = z
  .object({
    nameEn: boundedDbStringSchema.optional(),
    nameSv: boundedDbStringSchema.optional(),
  })
  .strict()

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(
    request,
    updateResponsibilityAreaSchema,
  )
  if (!parsedBody.ok) return parsedBody.response
  const auditContext = await createAdminPrivilegedAuditContext(request)
  const db = await getRequestSqlServerDataSource()
  const area = await updateSpecificationResponsibilityArea(
    db,
    parsedParams.data.id,
    parsedBody.data,
  )
  if (area === undefined) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 })
  }
  recordAdminPrivilegedActionSucceeded(auditContext, {
    changedFields: Object.keys(parsedBody.data),
    operation: 'update',
    resourceId: parsedParams.data.id,
    resourceType: 'specification_responsibility_area',
  })
  return NextResponse.json(area)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const auditContext = await createAdminPrivilegedAuditContext(request)
  const db = await getRequestSqlServerDataSource()
  const deletedCount = await deleteSpecificationResponsibilityArea(
    db,
    parsedParams.data.id,
  )
  if (deletedCount === 0) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 })
  }
  recordAdminPrivilegedActionSucceeded(auditContext, {
    operation: 'delete',
    resourceId: parsedParams.data.id,
    resourceType: 'specification_responsibility_area',
  })
  return NextResponse.json({ ok: true })
}
