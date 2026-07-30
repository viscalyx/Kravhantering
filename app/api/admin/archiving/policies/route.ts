import { type NextRequest, NextResponse } from 'next/server'
import { listArchivingRetentionPolicies } from '@/lib/archiving/retention'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  assertPrivacyOfficer,
  unexpectedErrorBody,
} from '@/lib/privacy/route-helpers'
import { createRequestContext } from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

async function getHandler(request: NextRequest) {
  try {
    const context = await createRequestContext(request, 'rest')
    assertPrivacyOfficer(context)
    const db = await getRequestSqlServerDataSource()
    const policies = await listArchivingRetentionPolicies(db)
    return NextResponse.json({ policies })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return NextResponse.json(body, { status })
    }
    logSanitizedError('Failed to list archiving policies', error)
    return NextResponse.json(
      unexpectedErrorBody('Failed to list archiving policies', error),
      { status: 500 },
    )
  }
}

export const GET = withRestResponsePolicy(getHandler)
