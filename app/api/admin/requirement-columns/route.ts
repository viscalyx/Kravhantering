import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  formatUiSettingsLoadError,
  getRequirementListColumnDefaults,
  updateRequirementListColumnDefaults,
} from '@/lib/dal/ui-settings'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  forbiddenError,
  isRequirementsServiceError,
} from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { REQUIREMENT_COLUMN_ORDER } from '@/lib/requirements/list-view'

const columnDefaultsEntrySchema = z
  .object({
    columnId: z.enum(REQUIREMENT_COLUMN_ORDER),
    defaultVisible: z.boolean(),
    sortOrder: z.number().int().min(0),
  })
  .strict()

const columnDefaultsPayloadSchema = z
  .object({
    columns: z
      .array(columnDefaultsEntrySchema)
      .length(REQUIREMENT_COLUMN_ORDER.length),
  })
  .strict()
  .superRefine((value, ctx) => {
    const uniqueColumnIds = new Set(
      value.columns.map(column => column.columnId),
    )
    const uniqueSortOrders = new Set(
      value.columns.map(column => column.sortOrder),
    )

    if (uniqueColumnIds.size !== REQUIREMENT_COLUMN_ORDER.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Each requirement column must be provided exactly once.',
        path: ['columns'],
      })
    }

    if (uniqueSortOrders.size !== REQUIREMENT_COLUMN_ORDER.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Each requirement column sort order must be unique.',
        path: ['columns'],
      })
    }
  })

function noStore<T extends NextResponse>(response: T): T {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

async function assertAdmin(request: Request) {
  const context = await createRequestContext(request, 'rest')
  if (!context.actor.roles.includes('Admin')) {
    throw forbiddenError('Missing required role for requirement columns', {
      actorRoles: context.actor.roles,
      reason: 'required_role_missing',
      requiredRoles: ['Admin'],
    })
  }
}

export async function GET(request: Request) {
  try {
    await assertAdmin(request)
    const db = await getRequestSqlServerDataSource()

    return noStore(
      NextResponse.json({
        columns: await getRequirementListColumnDefaults(db),
      }),
    )
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return noStore(NextResponse.json(body, { status }))
    }
    console.error(
      'Failed to load stored requirement column defaults',
      formatUiSettingsLoadError(error),
    )
    return noStore(
      NextResponse.json(
        { error: 'Failed to load requirement column defaults.' },
        { status: 500 },
      ),
    )
  }
}

export const PUT = secureMutationRoute({
  bodySchema: columnDefaultsPayloadSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const columns = await updateRequirementListColumnDefaults(
        db,
        body.columns,
        {
          audit: executor =>
            recordAdminPrivilegedActionSucceeded(
              context,
              {
                itemCount: body.columns.length,
                operation: 'save',
                resourceType: 'requirement_columns',
              },
              executor,
            ),
        },
      )

      return NextResponse.json({
        columns,
      })
    } catch (error) {
      console.error(
        'Failed to save requirement column defaults',
        formatUiSettingsLoadError(error),
      )
      return NextResponse.json(
        { error: 'Failed to save requirement column defaults.' },
        { status: 500 },
      )
    }
  },
})
