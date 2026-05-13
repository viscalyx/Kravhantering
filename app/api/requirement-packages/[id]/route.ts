import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded,
} from '@/lib/admin/privileged-audit'
import {
  deleteRequirementPackage,
  getLinkedRequirementsForPackage,
  getRequirementPackageById,
  updateRequirementPackage,
} from '@/lib/dal/requirement-packages'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  idParamSchema,
  optionalBusinessTextSchema,
  parseRouteParams,
  positiveIntegerSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const updateRequirementPackageSchema = z
  .object({
    descriptionEn: optionalBusinessTextSchema,
    descriptionSv: optionalBusinessTextSchema,
    nameEn: boundedDbStringSchema.optional(),
    nameSv: boundedDbStringSchema.optional(),
    ownerId: positiveIntegerSchema.nullable().optional(),
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
  const [requirementPackage, linkedRequirements] = await Promise.all([
    getRequirementPackageById(db, id),
    getLinkedRequirementsForPackage(db, id),
  ])
  if (!requirementPackage) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ requirementPackage, linkedRequirements })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedBody = await readJsonWithSchema(
    request,
    updateRequirementPackageSchema,
  )
  if (!parsedBody.ok) return parsedBody.response
  const auditContext = await createAdminPrivilegedAuditContext(request)
  const db = await getRequestSqlServerDataSource()
  const requirementPackage = await updateRequirementPackage(
    db,
    parsedParams.data.id,
    parsedBody.data,
  )
  if (!requirementPackage) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  recordAdminPrivilegedActionSucceeded(auditContext, {
    changedFields: Object.keys(parsedBody.data),
    operation: 'update',
    resourceId: parsedParams.data.id,
    resourceType: 'requirement_package',
  })
  return NextResponse.json(requirementPackage)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const auditContext = await createAdminPrivilegedAuditContext(request)
  const db = await getRequestSqlServerDataSource()
  const deletedCount = await deleteRequirementPackage(db, parsedParams.data.id)
  if (deletedCount === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  recordAdminPrivilegedActionSucceeded(auditContext, {
    operation: 'delete',
    resourceId: parsedParams.data.id,
    resourceType: 'requirement_package',
  })
  return NextResponse.json({ ok: true })
}
