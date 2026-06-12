import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import { isHsaIdPrefix } from '@/lib/auth/hsa-id'
import {
  formatUiSettingsLoadError,
  HsaIdPrefixSettingsError,
  listHsaIdPrefixesForAdmin,
  updateHsaIdPrefixes,
} from '@/lib/dal/ui-settings'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  DB_STRING_MAX_LENGTH,
  positiveIntegerSchema,
} from '@/lib/http/validation'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  forbiddenError,
  isRequirementsServiceError,
} from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

const hsaIdPrefixEntrySchema = z
  .object({
    id: positiveIntegerSchema.optional(),
    prefix: z.string().trim().refine(isHsaIdPrefix, {
      message:
        'HSA-id prefix must use two uppercase letters followed by ten digits.',
    }),
    label: z.string().trim().max(DB_STRING_MAX_LENGTH).nullable().optional(),
    isVisible: z.boolean(),
    isDefault: z.boolean(),
  })
  .strict()

const hsaIdPrefixesPayloadSchema = z
  .object({
    prefixes: z.array(hsaIdPrefixEntrySchema),
  })
  .strict()

function noStore<T extends NextResponse>(response: T): T {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

async function assertAdmin(request: Request) {
  const context = await createRequestContext(request, 'rest')
  if (!context.actor.roles.includes('Admin')) {
    throw forbiddenError('Missing required role for admin settings', {
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
        prefixes: await listHsaIdPrefixesForAdmin(db),
      }),
    )
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return noStore(NextResponse.json(body, { status }))
    }
    console.error(
      'Failed to load admin HSA-id prefixes',
      formatUiSettingsLoadError(error),
    )
    return noStore(
      NextResponse.json(
        { error: 'Failed to load HSA-id prefixes.' },
        { status: 500 },
      ),
    )
  }
}

export const PUT = secureMutationRoute({
  bodySchema: hsaIdPrefixesPayloadSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const prefixes = await updateHsaIdPrefixes(db, body.prefixes, {
        audit: executor =>
          recordAdminPrivilegedActionSucceeded(
            context,
            {
              itemCount: body.prefixes.length,
              operation: 'save',
              resourceType: 'hsa_id_prefix',
            },
            executor,
          ),
      })

      return noStore(NextResponse.json({ prefixes }))
    } catch (error) {
      if (error instanceof HsaIdPrefixSettingsError) {
        const status =
          error.code === 'used_prefix_cannot_delete' ||
          error.code === 'used_prefix_cannot_change'
            ? 409
            : 400
        return noStore(
          NextResponse.json(
            { code: error.code, error: error.message },
            { status },
          ),
        )
      }
      console.error(
        'Failed to save HSA-id prefixes',
        formatUiSettingsLoadError(error),
      )
      return noStore(
        NextResponse.json(
          { error: 'Failed to save HSA-id prefixes.' },
          { status: 500 },
        ),
      )
    }
  },
})
