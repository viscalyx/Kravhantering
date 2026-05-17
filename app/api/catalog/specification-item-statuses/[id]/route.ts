import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  getLinkedSpecificationItems,
  getSpecificationItemStatusById,
  updateSpecificationItemStatus,
} from '@/lib/dal/specification-item-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  idParamSchema,
  nonNegativeIntegerSchema,
  nullableBusinessTextSchema,
  parseRouteParams,
} from '@/lib/http/validation'
import { nullableOptionalStatusIconNameSchema } from '@/lib/icons/status-icon-schema'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const specificationItemStatusUpdateSchema = z
  .object({
    color: boundedDbStringSchema.optional(),
    descriptionEn: nullableBusinessTextSchema.optional(),
    descriptionSv: nullableBusinessTextSchema.optional(),
    iconName: nullableOptionalStatusIconNameSchema,
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
  const status = await getSpecificationItemStatusById(db, id)
  if (!status) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const linkedItems = await getLinkedSpecificationItems(db, id)
  return NextResponse.json({ status, linkedItems })
}

export const PUT = secureMutationRoute({
  bodySchema: specificationItemStatusUpdateSchema,
  paramsSchema: idParamSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const status = await updateSpecificationItemStatus(db, params.id, body)
    if (!status) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAdminPrivilegedActionSucceeded(context, {
      changedFields: Object.keys(body),
      operation: 'update',
      resourceId: params.id,
      resourceType: 'specification_item_status',
    })
    return NextResponse.json(status)
  },
})
