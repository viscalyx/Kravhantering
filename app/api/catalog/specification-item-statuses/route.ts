import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  countLinkedSpecificationItems,
  createSpecificationItemStatus,
  listSpecificationItemStatuses,
} from '@/lib/dal/specification-item-statuses'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  INTERNAL_SERVER_ERROR_MESSAGE,
  isDuplicateKeyError,
  logSanitizedError,
} from '@/lib/http/safe-errors'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  nonNegativeIntegerSchema,
  nullableBusinessTextSchema,
} from '@/lib/http/validation'
import { DEVIATED_SPECIFICATION_ITEM_STATUS_ID } from '@/lib/specification-item-status-constants'

const specificationItemStatusCreateSchema = z
  .object({
    color: boundedDbStringSchema,
    descriptionEn: nullableBusinessTextSchema.optional(),
    descriptionSv: nullableBusinessTextSchema.optional(),
    nameEn: boundedDbStringSchema,
    nameSv: boundedDbStringSchema,
    sortOrder: nonNegativeIntegerSchema.optional(),
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const [statuses, counts] = await Promise.all([
    listSpecificationItemStatuses(db),
    countLinkedSpecificationItems(db),
  ])
  return NextResponse.json({
    statuses: statuses.map(s => ({
      ...s,
      isDeviationStatus: s.id === DEVIATED_SPECIFICATION_ITEM_STATUS_ID,
      linkedItemCount: counts[s.id] ?? 0,
    })),
  })
}

export const POST = secureMutationRoute({
  bodySchema: specificationItemStatusCreateSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const status = await createSpecificationItemStatus(db, body)
      recordAdminPrivilegedActionSucceeded(context, {
        changedFields: Object.keys(body),
        operation: 'create',
        resourceId: status.id,
        resourceType: 'specification_item_status',
      })
      return NextResponse.json(status, { status: 201 })
    } catch (error) {
      const isDuplicate = isDuplicateKeyError(error)
      if (!isDuplicate) {
        logSanitizedError('Failed to create specification item status', error)
      }
      return NextResponse.json(
        {
          error: isDuplicate
            ? 'Duplicate entry'
            : INTERNAL_SERVER_ERROR_MESSAGE,
        },
        { status: isDuplicate ? 409 : 500 },
      )
    }
  },
})
