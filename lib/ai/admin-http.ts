import { NextResponse } from 'next/server'
import type { AiConnectionAdministrationService } from './admin-service'
import { createAiConnectionAdministrationRuntime } from './admin-runtime'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  forbiddenError,
  isRequirementsServiceError,
} from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { logSanitizedError } from '@/lib/http/safe-errors'

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
