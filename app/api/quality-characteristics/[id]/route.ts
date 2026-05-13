import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded,
} from '@/lib/admin/privileged-audit'
import {
  deleteQualityCharacteristic,
  listQualityCharacteristics,
  type QualityCharacteristicRow,
  updateQualityCharacteristic,
} from '@/lib/dal/requirement-types'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  INTERNAL_SERVER_ERROR_MESSAGE,
  isForeignKeyOrConstraintError,
  logSanitizedError,
} from '@/lib/http/safe-errors'
import {
  boundedDbStringSchema,
  idParamSchema,
  parseRouteParams,
  positiveIntegerSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const chapterIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^\d+(?:\.\d+)*$/, 'Expected an ISO chapter number')

const qualityCharacteristicUpdateSchema = z
  .object({
    chapterId: chapterIdSchema,
    nameEn: boundedDbStringSchema,
    nameSv: boundedDbStringSchema,
    parentId: positiveIntegerSchema.nullable().optional(),
    requirementTypeId: positiveIntegerSchema,
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
    qualityCharacteristicUpdateSchema,
  )
  if (!parsedBody.ok) return parsedBody.response
  const auditContext = await createAdminPrivilegedAuditContext(request)
  const db = await getRequestSqlServerDataSource()
  const category = await updateQualityCharacteristic(
    db,
    parsedParams.data.id,
    parsedBody.data,
  )
  if (!category) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  recordAdminPrivilegedActionSucceeded(auditContext, {
    changedFields: Object.keys(parsedBody.data),
    operation: 'update',
    resourceId: parsedParams.data.id,
    resourceType: 'quality_characteristic',
  })
  return NextResponse.json(category)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  const { id } = parsedParams.data
  const auditContext = await createAdminPrivilegedAuditContext(request)
  const db = await getRequestSqlServerDataSource()

  const allCategories = await listQualityCharacteristics(db)
  const hasChildren = allCategories.some(
    (category: QualityCharacteristicRow) => category.parentId === id,
  )
  if (hasChildren) {
    return NextResponse.json(
      { error: 'Has sub-characteristics' },
      { status: 409 },
    )
  }

  try {
    const deleted = await deleteQualityCharacteristic(db, id)
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    recordAdminPrivilegedActionSucceeded(auditContext, {
      operation: 'delete',
      resourceId: id,
      resourceType: 'quality_characteristic',
    })
  } catch (error) {
    if (isForeignKeyOrConstraintError(error)) {
      return NextResponse.json(
        { error: 'In use by requirements' },
        { status: 409 },
      )
    }
    logSanitizedError('Failed to delete quality characteristic', error)
    return NextResponse.json(
      { error: INTERNAL_SERVER_ERROR_MESSAGE },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true })
}
