import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  deleteQualityCharacteristic,
  hasChildQualityCharacteristics,
  updateQualityCharacteristic,
} from '@/lib/dal/requirement-types'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  INTERNAL_SERVER_ERROR_MESSAGE,
  isForeignKeyOrConstraintError,
  logSanitizedError,
} from '@/lib/http/safe-errors'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  idParamSchema,
  positiveIntegerSchema,
} from '@/lib/http/validation'

export const dynamic = 'force-dynamic'

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

export const PUT = secureMutationRoute({
  bodySchema: qualityCharacteristicUpdateSchema,
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const category = await updateQualityCharacteristic(db, params.id, body)
    if (!category) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'update',
      resourceId: params.id,
      resourceType: 'quality_characteristic',
    })
    return NextResponse.json(category)
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ context, params }) => {
    const { id } = params
    const db = await getRequestSqlServerDataSource()

    if (await hasChildQualityCharacteristics(db, id)) {
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
      recordAdminPrivilegedActionSucceeded(context, {
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
  },
})
