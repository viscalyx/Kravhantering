import { type NextRequest, NextResponse } from 'next/server'
import { listArchivingRetentionPolicies } from '@/lib/archiving/retention'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  assertPrivacyOfficer,
  unexpectedErrorBody,
} from '@/lib/privacy/route-helpers'
import { createRequestContext } from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

function noStore<T extends NextResponse>(response: T): T {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function GET(request: NextRequest) {
  try {
    const context = await createRequestContext(request, 'rest')
    assertPrivacyOfficer(context)
    const db = await getRequestSqlServerDataSource()
    const policies = await listArchivingRetentionPolicies(db)
    return noStore(NextResponse.json({ policies }))
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return noStore(NextResponse.json(body, { status }))
    }
    logSanitizedError('Failed to list archiving policies', error)
    return noStore(
      NextResponse.json(
        unexpectedErrorBody('Failed to list archiving policies', error),
        { status: 500 },
      ),
    )
  }
}
