import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  AI_SAFETY_RULE_IDS,
  AI_SAFETY_TERM_DIRECTIONS,
  AI_SAFETY_TERM_TYPES,
  createAiSafetyRuleTerm,
  listAiSafetyRulesForAdmin,
} from '@/lib/dal/ai-safety-rules'
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

const createTermSchema = z
  .object({
    direction: z.enum(AI_SAFETY_TERM_DIRECTIONS),
    ruleId: z.enum(AI_SAFETY_RULE_IDS),
    termText: z.string().trim().min(1).max(255),
    termType: z.enum(AI_SAFETY_TERM_TYPES),
  })
  .strict()

function noStore<T extends NextResponse>(response: T): T {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

async function assertAdmin(request: Request) {
  const context = await createRequestContext(request, 'rest')
  if (!context.actor.roles.includes('Admin')) {
    throw forbiddenError('Missing required role for AI safety rules', {
      actorRoles: context.actor.roles,
      reason: 'required_role_missing',
      requiredRoles: ['Admin'],
    })
  }
}

function errorResponse(error: unknown, fallbackMessage: string): NextResponse {
  if (isRequirementsServiceError(error)) {
    const { body, status } = toHttpErrorPayload(error)
    return noStore(NextResponse.json(body, { status }))
  }

  console.error(fallbackMessage, error)
  return noStore(NextResponse.json({ error: fallbackMessage }, { status: 500 }))
}

export async function GET(request: Request) {
  try {
    await assertAdmin(request)
    const db = await getRequestSqlServerDataSource()
    return noStore(
      NextResponse.json({ rules: await listAiSafetyRulesForAdmin(db) }),
    )
  } catch (error) {
    return errorResponse(error, 'Failed to load AI safety rules.')
  }
}

export const POST = secureMutationRoute({
  bodySchema: createTermSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const term = await createAiSafetyRuleTerm(db, body)
      await recordAdminPrivilegedActionSucceeded(context, {
        changedFields: ['direction', 'isActive', 'termType'],
        operation: 'create',
        resourceId: term.id,
        resourceType: 'ai_safety_rule_term',
      })
      return noStore(NextResponse.json({ term }))
    } catch (error) {
      return errorResponse(error, 'Failed to create AI safety term.')
    }
  },
})
