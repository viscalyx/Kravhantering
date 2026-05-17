import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  createQualityCharacteristic,
  listQualityCharacteristics,
} from '@/lib/dal/requirement-types'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  parseSearchParams,
  positiveIntegerSchema,
  positiveIntegerStringSchema,
} from '@/lib/http/validation'

const qualityCharacteristicsQuerySchema = z
  .object({
    typeId: positiveIntegerStringSchema.optional(),
  })
  .strict()

const chapterIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^\d+(?:\.\d+)*$/, 'Expected an ISO chapter number')

const qualityCharacteristicCreateSchema = z
  .object({
    chapterId: chapterIdSchema,
    nameEn: boundedDbStringSchema,
    nameSv: boundedDbStringSchema,
    parentId: positiveIntegerSchema.nullable().optional(),
    requirementTypeId: positiveIntegerSchema,
  })
  .strict()

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const parsedQuery = parseSearchParams(
    url.searchParams,
    qualityCharacteristicsQuerySchema,
  )
  if (!parsedQuery.ok) return parsedQuery.response
  const { typeId } = parsedQuery.data

  if (typeId != null) {
    const db = await getRequestSqlServerDataSource()
    const qualityCharacteristics = await listQualityCharacteristics(db, typeId)
    return NextResponse.json({ qualityCharacteristics })
  }

  const db = await getRequestSqlServerDataSource()
  const qualityCharacteristics = await listQualityCharacteristics(db)
  return NextResponse.json({ qualityCharacteristics })
}

export const POST = secureMutationRoute({
  bodySchema: qualityCharacteristicCreateSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    const category = await createQualityCharacteristic(db, body)
    await recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'create',
      resourceId: category.id,
      resourceType: 'quality_characteristic',
    })
    return NextResponse.json(category, { status: 201 })
  },
})
