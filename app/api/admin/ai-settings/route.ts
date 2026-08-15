import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  isValidAiSafetyRuleCacheTtlSeconds,
  isValidMcpImportMaxActiveSessionsPerDestination,
  isValidMcpImportMaxActiveSessionsPerPrincipal,
  isValidMcpImportMaxCreationsPerWindow,
  isValidMcpImportMaxReservedBytes,
  isValidMcpImportMaxRows,
  isValidMcpImportValidationTtlMinutes,
  isValidMcpMaxRequestBytes,
} from '@/lib/ai/generation-availability'
import { clearAiSafetyRuleSetCache } from '@/lib/dal/ai-safety-rules'
import {
  formatAiSettingsLoadError,
  getAdminAiSettings,
  patchAiGenerationSettings,
  updateAiGenerationSettings,
} from '@/lib/dal/ai-settings'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
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
    mcpImportMaxActiveSessionsPerDestination: z
      .number()
      .int()
      .refine(
        isValidMcpImportMaxActiveSessionsPerDestination,
        'Invalid MCP destination session quota.',
      ),
    mcpImportMaxActiveSessionsPerPrincipal: z
      .number()
      .int()
      .refine(
        isValidMcpImportMaxActiveSessionsPerPrincipal,
        'Invalid MCP principal session quota.',
      ),
    mcpImportMaxCreationsPerWindow: z
      .number()
      .int()
      .refine(
        isValidMcpImportMaxCreationsPerWindow,
        'Invalid MCP validation-session creation quota.',
      ),
    mcpImportMaxReservedBytes: z
      .number()
      .int()
      .refine(
        isValidMcpImportMaxReservedBytes,
        'Invalid MCP validation-session storage quota.',
      ),
    mcpMaxRequestBytes: z
      .number()
      .int()
      .refine(isValidMcpMaxRequestBytes, 'Invalid MCP payload/session limit.'),
    mcpImportMaxRows: z
      .number()
      .int()
      .refine(isValidMcpImportMaxRows, 'Invalid MCP import row limit.'),
    mcpImportValidationTtlMinutes: z
      .number()
      .int()
      .refine(
        isValidMcpImportValidationTtlMinutes,
        'Invalid MCP import validation session TTL.',
      ),
    requirementGenerationEnabled: z.boolean(),
    aiSafetyRuleCacheTtlSeconds: z
      .number()
      .int()
      .refine(
        isValidAiSafetyRuleCacheTtlSeconds,
        'Invalid AI safety rule cache TTL.',
      ),
  })
  .strict()

const aiSettingsPatchPayloadSchema = aiSettingsPayloadSchema
  .partial()
  .refine(body => Object.keys(body).length > 0, {
    message: 'Expected at least one AI setting.',
  })

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

async function getHandler(request: Request) {
  try {
    await assertAdmin(request)
    const db = await getRequestSqlServerDataSource()
    return NextResponse.json(await getAdminAiSettings(db))
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }
    console.error(
      'Failed to load admin AI settings',
      formatAiSettingsLoadError(error),
    )
    return NextResponse.json(
      { error: 'Failed to load AI settings.' },
      { status: 500 },
    )
  }
}

export const GET = withRestResponsePolicy(getHandler)

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
                'mcpImportMaxActiveSessionsPerDestination',
                'mcpImportMaxActiveSessionsPerPrincipal',
                'mcpImportMaxCreationsPerWindow',
                'mcpImportMaxReservedBytes',
                'mcpImportMaxRows',
                'mcpImportValidationTtlMinutes',
                'aiSafetyRuleCacheTtlSeconds',
              ],
              operation: 'save',
              resourceId: 'global',
              resourceType: 'ai_settings',
            },
            executor,
          ),
      })
      clearAiSafetyRuleSetCache()

      return NextResponse.json(settings)
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }

      console.error(
        'Failed to save admin AI settings',
        formatAiSettingsLoadError(error),
      )
      return NextResponse.json(
        { error: 'Failed to save AI settings.' },
        { status: 500 },
      )
    }
  },
})

export const PATCH = secureMutationRoute({
  bodySchema: aiSettingsPatchPayloadSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const settings = await patchAiGenerationSettings(db, body, {
        audit: executor =>
          recordAdminPrivilegedActionSucceeded(
            context,
            {
              changedFields: Object.keys(body),
              operation: 'update',
              resourceId: 'global',
              resourceType: 'ai_settings',
            },
            executor,
          ),
      })
      clearAiSafetyRuleSetCache()

      return NextResponse.json(settings)
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }

      console.error(
        'Failed to update admin AI settings',
        formatAiSettingsLoadError(error),
      )
      return NextResponse.json(
        { error: 'Failed to save AI settings.' },
        { status: 500 },
      )
    }
  },
})
