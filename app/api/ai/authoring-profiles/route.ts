import { type NextRequest, NextResponse } from 'next/server'
import {
  type AiAuthoringProfileDescription,
  createProductionAiAuthoringRuntime,
} from '@/lib/ai/authoring-runtime'
import type { AiRunType } from '@/lib/ai/run-contracts'
import { getAiGenerationAvailability } from '@/lib/dal/ai-settings'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
import { logSanitizedError } from '@/lib/http/safe-errors'
import { applyResponseCorrelationHeaders } from '@/lib/observability/request-ids'
import { createRequestContext } from '@/lib/requirements/auth'
import { unauthorizedError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

const AUTHORING_RUN_TYPES = [
  'generate_without_images',
  'generate_with_images',
  'repair_invalid_import_json',
] as const satisfies readonly AiRunType[]

const BLOCKED_PROFILE = Object.freeze({
  available: false,
  reason: 'blocked',
}) satisfies AiAuthoringProfileDescription

async function getHandler(request: NextRequest): Promise<Response> {
  const context = await createRequestContext(request, 'rest')
  if (!context.actor.isAuthenticated) {
    const { body, status } = toHttpErrorPayload(unauthorizedError())
    return applyResponseCorrelationHeaders(
      NextResponse.json(body, { status }),
      context,
    )
  }

  try {
    const db = await getRequestSqlServerDataSource()
    const availability = await getAiGenerationAvailability(db)
    if (!availability.effectiveRequirementGenerationEnabled) {
      return applyResponseCorrelationHeaders(
        NextResponse.json({
          enabled: false,
          profiles: Object.fromEntries(
            AUTHORING_RUN_TYPES.map(type => [type, BLOCKED_PROFILE]),
          ),
        }),
        context,
      )
    }
    const runtime = createProductionAiAuthoringRuntime(db)
    const descriptions = await Promise.all(
      AUTHORING_RUN_TYPES.map(type => runtime.describe(type)),
    )
    return applyResponseCorrelationHeaders(
      NextResponse.json({
        enabled: true,
        profiles: Object.fromEntries(
          AUTHORING_RUN_TYPES.map((type, index) => [
            type,
            descriptions[index] ?? BLOCKED_PROFILE,
          ]),
        ),
      }),
      context,
    )
  } catch (error) {
    logSanitizedError('AI authoring profile availability failed', error)
    return applyResponseCorrelationHeaders(
      NextResponse.json({
        enabled: true,
        profiles: Object.fromEntries(
          AUTHORING_RUN_TYPES.map(type => [type, BLOCKED_PROFILE]),
        ),
      }),
      context,
    )
  }
}

export const GET = withRestResponsePolicy(getHandler)
