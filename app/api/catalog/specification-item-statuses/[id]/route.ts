import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  getLinkedSpecificationItems,
  getSpecificationItemStatusById,
  updateSpecificationItemStatus,
} from '@/lib/dal/specification-item-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
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
  strictHexColorSchema,
} from '@/lib/http/validation'
import { nullableOptionalStatusIconNameSchema } from '@/lib/icons/status-icon-schema'
import { createRequestContext } from '@/lib/requirements/auth'
import { forbiddenError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const specificationItemStatusUpdateSchema = z
  .object({
    color: strictHexColorSchema.optional(),
    descriptionEn: nullableBusinessTextSchema.optional(),
    descriptionSv: nullableBusinessTextSchema.optional(),
    iconName: nullableOptionalStatusIconNameSchema,
    nameEn: boundedDbStringSchema.optional(),
    nameSv: boundedDbStringSchema.optional(),
    sortOrder: nonNegativeIntegerSchema.optional(),
  })
  .strict()

async function getHandler(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, idParamSchema)
  if (!parsedParams.ok) return parsedParams.response
  try {
    const context = await createRequestContext(request, 'rest')
    if (!context.actor.roles.includes('Admin')) {
      throw forbiddenError(
        'Admin role is required to inspect linked specification items',
        {
          actorRoles: context.actor.roles,
          reason: 'required_role_missing',
          requiredRoles: ['Admin'],
        },
      )
    }

    const { id } = parsedParams.data
    const db = await getRequestSqlServerDataSource()
    const status = await getSpecificationItemStatusById(db, id)
    if (!status) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const linkedItems = await getLinkedSpecificationItems(db, id)
    return NextResponse.json({ status, linkedItems })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const GET = withRestResponsePolicy(getHandler)

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
