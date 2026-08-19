import { NextResponse } from 'next/server'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  forbiddenError,
  isRequirementsServiceError,
} from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createAiConnectionAdministrationRuntime } from './admin-runtime'
import type { AiConnectionAdministrationService } from './admin-service'
import { isAiRequirementGenerationDisabled } from './scan-guard'

const DEPLOYMENT_ENVIRONMENTS = new Set(['production', 'prodlike', 'staging'])
const SAFE_ENVIRONMENT_ID = /^[A-Za-z0-9._:-]{1,160}$/u

function deploymentProofHeaders(
  env: NodeJS.ProcessEnv = process.env,
): Readonly<Record<string, string>> {
  const configuredEnvironment = env.KRAVHANTERING_DEPLOYMENT_ENVIRONMENT?.trim()
  const configuredEnvironmentId =
    env.KRAVHANTERING_DEPLOYMENT_ENVIRONMENT_ID?.trim()
  return {
    'x-kravhantering-ai-guard-active': String(
      isAiRequirementGenerationDisabled(env),
    ),
    'x-kravhantering-deployment-environment':
      configuredEnvironment &&
      DEPLOYMENT_ENVIRONMENTS.has(configuredEnvironment)
        ? configuredEnvironment
        : 'unconfigured',
    'x-kravhantering-deployment-environment-id':
      configuredEnvironmentId &&
      SAFE_ENVIRONMENT_ID.test(configuredEnvironmentId)
        ? configuredEnvironmentId
        : 'unconfigured',
  }
}

export async function adminAiRead(
  request: Request,
  load: (service: AiConnectionAdministrationService) => Promise<unknown>,
): Promise<NextResponse> {
  try {
    const context = await createRequestContext(request, 'rest')
    if (!context.actor.roles.includes('Admin')) {
      throw forbiddenError('Missing required role for AI administration.', {
        reason: 'required_role_missing',
        requiredRoles: ['Admin'],
      })
    }
    const db = await getRequestSqlServerDataSource()
    return NextResponse.json(
      await load(createAiConnectionAdministrationRuntime(db, context)),
      { headers: deploymentProofHeaders() },
    )
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }
    logSanitizedError('Failed to read AI administration metadata.', error)
    return NextResponse.json(
      { error: 'Failed to read AI administration metadata.' },
      { status: 500 },
    )
  }
}
