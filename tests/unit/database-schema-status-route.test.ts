import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  createRequestContext: vi.fn(),
  readDatabaseSchemaStatus: vi.fn(),
}))

vi.mock('@/lib/requirements/auth', () => ({
  createRequestContext: routeState.createRequestContext,
}))

vi.mock('@/lib/database-schema-status', () => ({
  readDatabaseSchemaStatus: routeState.readDatabaseSchemaStatus,
}))

import { GET } from '@/app/api/database-schema-status/route'

const EXPECTED_SCHEMA_VERSION = 'InitialSchema1713720000000'
const OBSERVED_SCHEMA_VERSION = 'OlderSchema1713000000000'

function request() {
  return new Request('https://app.example.com/api/database-schema-status')
}

function setActor({
  authenticated = true,
  roles = [],
}: {
  authenticated?: boolean
  roles?: string[]
} = {}) {
  routeState.createRequestContext.mockResolvedValue({
    actor: {
      displayName: authenticated ? 'Ada Admin' : '',
      hsaId: authenticated ? 'SE5560000001-admin' : null,
      id: authenticated ? 'user-1' : null,
      isAuthenticated: authenticated,
      roles,
      source: authenticated ? 'oidc' : 'anonymous',
    },
    correlationId: 'corr-1',
    requestId: 'req-1',
    source: 'rest',
  })
}

async function readJson(response: Response) {
  return JSON.parse(await response.text()) as Record<string, unknown>
}

describe('GET /api/database-schema-status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActor()
    routeState.readDatabaseSchemaStatus.mockResolvedValue({
      expectedDatabaseSchemaVersion: EXPECTED_SCHEMA_VERSION,
      observedDatabaseSchemaVersion: EXPECTED_SCHEMA_VERSION,
      status: 'matches',
    })
  })

  it('requires an authenticated user before reading database schema status', async () => {
    setActor({ authenticated: false })

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(readJson(response)).resolves.toEqual({
      code: 'unauthorized',
      error: 'Authentication is required',
    })
    expect(routeState.readDatabaseSchemaStatus).not.toHaveBeenCalled()
  })

  it('returns matching status without exposing observed schema version', async () => {
    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(readJson(response)).resolves.toEqual({
      expectedDatabaseSchemaVersion: EXPECTED_SCHEMA_VERSION,
      status: 'matches',
    })
  })

  it('returns mismatch as a readable status for non-admin users', async () => {
    routeState.readDatabaseSchemaStatus.mockResolvedValue({
      expectedDatabaseSchemaVersion: EXPECTED_SCHEMA_VERSION,
      observedDatabaseSchemaVersion: OBSERVED_SCHEMA_VERSION,
      reason: 'database_schema_version_mismatch',
      status: 'mismatch',
    })

    const response = await GET(request())
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body).toEqual({
      expectedDatabaseSchemaVersion: EXPECTED_SCHEMA_VERSION,
      reason: 'database_schema_version_mismatch',
      status: 'mismatch',
    })
    expect(body).not.toHaveProperty('observedDatabaseSchemaVersion')
  })

  it('includes observed mismatch details for Admin users', async () => {
    setActor({ roles: ['Admin'] })
    routeState.readDatabaseSchemaStatus.mockResolvedValue({
      expectedDatabaseSchemaVersion: EXPECTED_SCHEMA_VERSION,
      observedDatabaseSchemaVersion: OBSERVED_SCHEMA_VERSION,
      reason: 'database_schema_version_mismatch',
      status: 'mismatch',
    })

    const response = await GET(request())

    expect(response.status).toBe(200)
    await expect(readJson(response)).resolves.toEqual({
      expectedDatabaseSchemaVersion: EXPECTED_SCHEMA_VERSION,
      observedDatabaseSchemaVersion: OBSERVED_SCHEMA_VERSION,
      reason: 'database_schema_version_mismatch',
      status: 'mismatch',
    })
  })

  it('uses service unavailable when status cannot be checked', async () => {
    routeState.readDatabaseSchemaStatus.mockResolvedValue({
      expectedDatabaseSchemaVersion: EXPECTED_SCHEMA_VERSION,
      observedDatabaseSchemaVersion: null,
      reason: 'database_schema_version_check_failed',
      status: 'unknown',
    })

    const response = await GET(request())

    expect(response.status).toBe(503)
    await expect(readJson(response)).resolves.toEqual({
      expectedDatabaseSchemaVersion: EXPECTED_SCHEMA_VERSION,
      reason: 'database_schema_version_check_failed',
      status: 'unknown',
    })
  })
})
