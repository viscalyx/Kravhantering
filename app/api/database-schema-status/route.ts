import { NextResponse } from 'next/server'
import {
  type DatabaseSchemaStatus,
  type DatabaseSchemaStatusReason,
  readDatabaseSchemaStatus,
} from '@/lib/database-schema-status'
import { createRequestContext } from '@/lib/requirements/auth'
import {
  isRequirementsServiceError,
  unauthorizedError,
} from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface DatabaseSchemaStatusResponse {
  expectedDatabaseSchemaVersion: string | null
  observedDatabaseSchemaVersion?: string | null
  reason?: DatabaseSchemaStatusReason
  status: DatabaseSchemaStatus['status']
}

function noStore<T extends NextResponse>(response: T): T {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function toResponseBody(
  status: DatabaseSchemaStatus,
  includeObservedDatabaseSchemaVersion: boolean,
): DatabaseSchemaStatusResponse {
  const body: DatabaseSchemaStatusResponse = {
    expectedDatabaseSchemaVersion: status.expectedDatabaseSchemaVersion,
    status: status.status,
  }

  if (status.status !== 'matches') {
    body.reason = status.reason
  }

  if (includeObservedDatabaseSchemaVersion && status.status === 'mismatch') {
    body.observedDatabaseSchemaVersion = status.observedDatabaseSchemaVersion
  }

  return body
}

export async function GET(request: Request) {
  try {
    const context = await createRequestContext(request, 'rest')
    if (!context.actor.isAuthenticated) {
      throw unauthorizedError()
    }

    const status = await readDatabaseSchemaStatus()
    const includeObservedDatabaseSchemaVersion =
      context.actor.roles.includes('Admin')
    return noStore(
      NextResponse.json(
        toResponseBody(status, includeObservedDatabaseSchemaVersion),
        { status: status.status === 'unknown' ? 503 : 200 },
      ),
    )
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      const { body, status } = toHttpErrorPayload(error)
      return noStore(NextResponse.json(body, { status }))
    }

    console.warn('[database-schema-status] check failed', {
      error: error instanceof Error ? error.name : 'Error',
    })
    return noStore(
      NextResponse.json(
        {
          error: 'Database schema status could not be checked.',
        },
        { status: 503 },
      ),
    )
  }
}
