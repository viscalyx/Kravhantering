import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import { isValidMcpMaxRequestBytes } from '@/lib/ai/generation-availability'
import {
  formatAiSettingsLoadError,
  getAiGenerationAvailability,
  updateAiGenerationSettings,
} from '@/lib/dal/ai-settings'
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

const aiSettingsPayloadSchema = z
  .object({
    mcpMaxRequestBytes: z
      .number()
      .int()
      .refine(isValidMcpMaxRequestBytes, 'Invalid MCP request payload limit.'),
    requirementGenerationEnabled: z.boolean(),
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
    return noStore(NextResponse.json(await getAiGenerationAvailability(db)))
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return noStore(NextResponse.json(body, { status }))
    }
    console.error(
      'Failed to load admin AI settings',
      formatAiSettingsLoadError(error),
    )
    return noStore(
      NextResponse.json(
        { error: 'Failed to load AI settings.' },
        { status: 500 },
      ),
    )
  }
}

export const PUT = secureMutationRoute({
  bodySchema: aiSettingsPayloadSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const settings = await updateAiGenerationSettings(db, body, {
        audit: executor =>
          recordAdminPrivilegedActionSucceeded(
            context,
            {
              changedFields: [
                'requirementGenerationEnabled',
                'mcpMaxRequestBytes',
              ],
              operation: 'save',
              resourceId: 'global',
              resourceType: 'ai_settings',
            },
            executor,
          ),
      })

      return noStore(NextResponse.json(settings))
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return noStore(NextResponse.json(body, { status }))
      }

      console.error(
        'Failed to save admin AI settings',
        formatAiSettingsLoadError(error),
      )
      return noStore(
        NextResponse.json(
          { error: 'Failed to save AI settings.' },
          { status: 500 },
        ),
      )
    }
  },
})
