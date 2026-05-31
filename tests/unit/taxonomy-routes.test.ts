import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validationError } from '@/lib/requirements/errors'

/* ── shared request DB mocks ─────────────────────────────────────── */

const routeState = vi.hoisted(() => {
  const transactionDb = { query: vi.fn() }
  const transaction = vi.fn(async (callback: (manager: unknown) => unknown) =>
    callback(transactionDb),
  )
  return {
    getRequestSqlServerDataSource: vi.fn(() => ({ transaction })),
    transaction,
    transactionDb,
  }
})

const auditState = vi.hoisted(() => ({
  createAdminPrivilegedAuditContext: vi.fn(async () => ({
    actor: {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc',
    },
    request: {
      method: 'POST',
      path: '/api/taxonomy',
      requestId: 'request-taxonomy',
    },
    correlationId: 'correlation-taxonomy',
    requestId: 'request-taxonomy',
    source: 'rest',
  })),
  recordAdminPrivilegedActionSucceeded: vi.fn(),
}))

const requirementsRuntimeState = vi.hoisted(() => {
  const listSpecifications = vi.fn(async () => ({
    message: 'ok',
    specifications: [{ id: 1 }],
  }))
  return {
    createRequirementsRestRuntime: vi.fn(async () => ({
      context: { source: 'rest' },
      service: { listSpecifications },
    })),
    listSpecifications,
  }
})

const authState = vi.hoisted(() => ({
  assertAuthorized: vi.fn(),
  context: {
    actor: {
      displayName: 'Route Tester',
      hsaId: 'SE5560000001-route',
      id: 'route-test',
      isAuthenticated: true,
      roles: ['RequirementsEditor'],
      source: 'oidc',
    },
    correlationId: 'correlation-taxonomy',
    requestId: 'request-taxonomy',
    source: 'rest',
  },
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/admin/privileged-audit', () => ({
  createAdminPrivilegedAuditContext:
    auditState.createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded:
    auditState.recordAdminPrivilegedActionSucceeded,
}))

vi.mock('@/lib/audit/action-audit', () => ({
  recordAllowedActionAuditEvent: vi.fn(),
  recordDeniedActionAuditEvent: vi.fn(),
}))

vi.mock('@/lib/audit/requirement-selection-cleanup-audit', () => ({
  recordRequirementSelectionCleanupAudit: vi.fn(),
}))

vi.mock('@/lib/requirements/auth', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/requirements/auth')>()
  return {
    ...actual,
    createDefaultAuthorizationService: () => ({
      assertAuthorized: authState.assertAuthorized,
    }),
    createRequestContext: vi.fn(async () => authState.context),
  }
})

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime:
    requirementsRuntimeState.createRequirementsRestRuntime,
}))

/* ── DAL mocks ───────────────────────────────────────────────────── */

const mockUpdateImpl = vi.fn()
const mockDeleteImpl = vi.fn()
vi.mock('@/lib/dal/specification-implementation-types', () => ({
  listSpecificationImplementationTypes: async () => [{ id: 1 }],
  createSpecificationImplementationType: async () => ({ id: 2 }),
  updateSpecificationImplementationType: (...a: unknown[]) =>
    mockUpdateImpl(...a),
  deleteSpecificationImplementationType: (...a: unknown[]) =>
    mockDeleteImpl(...a),
}))

const mockUpdateLifecycle = vi.fn()
const mockDeleteLifecycle = vi.fn()
vi.mock('@/lib/dal/specification-lifecycle-statuses', () => ({
  listSpecificationLifecycleStatuses: async () => [{ id: 1 }],
  createSpecificationLifecycleStatus: async () => ({ id: 2 }),
  updateSpecificationLifecycleStatus: (...a: unknown[]) =>
    mockUpdateLifecycle(...a),
  deleteSpecificationLifecycleStatus: (...a: unknown[]) =>
    mockDeleteLifecycle(...a),
}))

const mockUpdateGovernanceObjectType = vi.fn()
const mockDeleteGovernanceObjectType = vi.fn()
vi.mock('@/lib/dal/specification-governance-object-types', () => ({
  listSpecificationGovernanceObjectTypes: async () => [{ id: 1 }],
  createSpecificationGovernanceObjectType: async () => ({ id: 2 }),
  updateSpecificationGovernanceObjectType: (...a: unknown[]) =>
    mockUpdateGovernanceObjectType(...a),
  deleteSpecificationGovernanceObjectType: (...a: unknown[]) =>
    mockDeleteGovernanceObjectType(...a),
}))

const mockUpdateReqArea = vi.fn()
const mockDeleteReqArea = vi.fn()
vi.mock('@/lib/dal/requirement-areas', () => ({
  listAreas: async () => [{ id: 1 }],
  createArea: async () => ({ id: 2 }),
  updateArea: (...a: unknown[]) => mockUpdateReqArea(...a),
  deleteArea: (...a: unknown[]) => mockDeleteReqArea(...a),
}))

vi.mock('@/lib/dal/owners', () => ({
  listOwners: async () => [],
}))

const mockListSpecItemStatuses = vi.fn(async (..._args: unknown[]) => [
  { id: 5, nameEn: 'Deviated', nameSv: 'Avviken' },
])
const mockCountLinkedSpecificationItems = vi.fn(
  async (..._args: unknown[]) => ({
    5: 3,
  }),
)
const mockCreateSpecItemStatus = vi.fn(async (..._args: unknown[]) => ({
  id: 6,
}))
const mockGetSpecItemStatus = vi.fn(async (..._args: unknown[]) => ({ id: 5 }))
const mockGetLinkedSpecificationItems = vi.fn(async (..._args: unknown[]) => [])
const mockUpdateSpecItemStatus = vi.fn()
const mockDeleteSpecItemStatus = vi.fn()
vi.mock('@/lib/dal/specification-item-statuses', () => ({
  countLinkedSpecificationItems: (...a: unknown[]) =>
    mockCountLinkedSpecificationItems(...a),
  createSpecificationItemStatus: (...a: unknown[]) =>
    mockCreateSpecItemStatus(...a),
  deleteSpecificationItemStatus: (...a: unknown[]) =>
    mockDeleteSpecItemStatus(...a),
  getLinkedSpecificationItems: (...a: unknown[]) =>
    mockGetLinkedSpecificationItems(...a),
  getSpecificationItemStatusById: (...a: unknown[]) =>
    mockGetSpecItemStatus(...a),
  listSpecificationItemStatuses: (...a: unknown[]) =>
    mockListSpecItemStatuses(...a),
  updateSpecificationItemStatus: (...a: unknown[]) =>
    mockUpdateSpecItemStatus(...a),
}))

const mockCreatePkg = vi.fn(async (..._args: unknown[]) => ({ id: 2 }))
const mockUpdatePkg = vi.fn()
const mockDeletePkg = vi.fn()
vi.mock('@/lib/dal/requirements-specifications', () => ({
  listSpecifications: async () => [{ id: 1 }],
  createSpecification: (...a: unknown[]) => mockCreatePkg(...a),
  updateSpecification: (...a: unknown[]) => mockUpdatePkg(...a),
  deleteSpecification: (...a: unknown[]) => mockDeletePkg(...a),
  getSpecificationById: async (_db: unknown, id: number) => ({ id }),
  getSpecificationBySlug: async () => null,
  isSlugTaken: async () => false,
}))

const mockUpdateRequirementPackage = vi.fn()
const mockDeleteRequirementPackage = vi.fn()
vi.mock('@/lib/dal/requirement-packages', () => ({
  listRequirementPackages: async () => [{ id: 1 }],
  countLinkedRequirementsByPackage: async () => ({}),
  createRequirementPackage: async () => ({ id: 2 }),
  getLinkedRequirementsForPackage: async () => [],
  getRequirementPackageById: async () => null,
  getRequirementPackageUsage: async () => ({
    answerLinkCount: 0,
    libraryRequirementCount: 0,
    localRequirementCount: 0,
  }),
  updateRequirementPackage: (...a: unknown[]) =>
    mockUpdateRequirementPackage(...a),
  deleteRequirementPackage: (...a: unknown[]) =>
    mockDeleteRequirementPackage(...a),
}))

vi.mock('@/lib/dal/requirement-types', () => ({
  listTypes: async () => [{ id: 1 }],
  listQualityCharacteristics: async () => [{ id: 10 }],
  createQualityCharacteristic: async () => ({ id: 20 }),
}))

vi.mock('@/lib/dal/requirement-categories', () => ({
  listCategories: async () => [{ id: 1 }],
}))

/* ── imports ─────────────────────────────────────────────────────── */

import {
  GET as getSpecItemStatus,
  PUT as putSpecItemStatus,
} from '@/app/api/catalog/specification-item-statuses/[id]/route'
import { GET as getSpecItemStatuses } from '@/app/api/catalog/specification-item-statuses/route'
import {
  GET as getTypeCats,
  POST as postTypeCat,
} from '@/app/api/quality-characteristics/route'
import {
  DELETE as deleteReqArea,
  PUT as putReqArea,
} from '@/app/api/requirement-areas/[id]/route'
import {
  GET as getReqAreas,
  POST as postReqArea,
} from '@/app/api/requirement-areas/route'
import { GET as getCats } from '@/app/api/requirement-categories/route'
import {
  DELETE as deleteRequirementPackage,
  PUT as putRequirementPackage,
} from '@/app/api/requirement-packages/[id]/route'
import {
  GET as getRequirementPackages,
  POST as postRequirementPackage,
} from '@/app/api/requirement-packages/route'
import { GET as getTypes } from '@/app/api/requirement-types/route'
import {
  DELETE as deleteGovernanceObjectType,
  PUT as putGovernanceObjectType,
} from '@/app/api/specification-governance-object-types/[id]/route'
import {
  GET as getGovernanceObjectTypes,
  POST as postGovernanceObjectType,
} from '@/app/api/specification-governance-object-types/route'
import {
  DELETE as deleteImplType,
  PUT as putImplType,
} from '@/app/api/specification-implementation-types/[id]/route'
import {
  GET as getImplTypes,
  POST as postImplType,
} from '@/app/api/specification-implementation-types/route'
import {
  DELETE as deleteLifecycle,
  PUT as putLifecycle,
} from '@/app/api/specification-lifecycle-statuses/[id]/route'
import {
  GET as getLifecycleStatuses,
  POST as postLifecycle,
} from '@/app/api/specification-lifecycle-statuses/route'
import {
  DELETE as deletePkg,
  PUT as putPkg,
} from '@/app/api/specifications/[id]/route'
import { GET as getPkgs, POST as postPkg } from '@/app/api/specifications/route'

/* ── helpers ─────────────────────────────────────────────────────── */

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function jsonReq(method: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

async function expectInvalidRequest(
  response: Response,
  path?: string,
): Promise<void> {
  const body = (await response.json()) as {
    error: string
    issues: Array<{ path: string }>
  }
  expect(body.error).toBe('Invalid request')
  expect(body.issues.length).toBeGreaterThan(0)
  if (path) {
    expect(body.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path })]),
    )
  }
}

/* ── tests ───────────────────────────────────────────────────────── */

describe('specification-implementation-types routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns types', async () => {
    const r = await getImplTypes()
    const j = (await r.json()) as { types: { id: number }[] }
    expect(j.types).toHaveLength(1)
  })
  it('POST creates with 201', async () => {
    const r = await postImplType(
      new Request('http://l', {
        method: 'POST',
        body: '{"nameSv":"A","nameEn":"B"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(201)
  })
  it('PUT updates', async () => {
    mockUpdateImpl.mockResolvedValue({ id: 1 })
    const r = await putImplType(
      jsonReq('PUT', { nameEn: 'X' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { id: number }).id).toBe(1)
  })
  it('PUT rejects empty update payloads', async () => {
    const r = await putImplType(jsonReq('PUT', {}), makeParams('1'))
    const body = (await r.json()) as {
      error: string
      issues: Array<{ message: string }>
    }

    expect(r.status).toBe(400)
    expect(body.error).toBe('Invalid request')
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'At least one of nameEn or nameSv must be provided',
        }),
      ]),
    )
    expect(mockUpdateImpl).not.toHaveBeenCalled()
  })
  it('PUT returns 404 without audit when the implementation type is missing', async () => {
    mockUpdateImpl.mockResolvedValue(undefined)
    const r = await putImplType(
      jsonReq('PUT', { nameEn: 'Missing' }),
      makeParams('404'),
    )

    expect(r.status).toBe(404)
    await expect(r.json()).resolves.toEqual({ error: 'Not found' })
    expect(
      auditState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })
  it('DELETE deletes', async () => {
    mockDeleteImpl.mockResolvedValue(1)
    const r = await deleteImplType(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true)
  })
})

describe('specification-lifecycle-statuses routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns statuses', async () => {
    const r = await getLifecycleStatuses()
    const j = (await r.json()) as { statuses: { id: number }[] }
    expect(j.statuses).toHaveLength(1)
  })
  it('POST creates with 201', async () => {
    const r = await postLifecycle(
      new Request('http://l', {
        method: 'POST',
        body: '{"nameSv":"A","nameEn":"B"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(201)
  })
  it('PUT updates', async () => {
    mockUpdateLifecycle.mockResolvedValue({ id: 1 })
    const r = await putLifecycle(
      jsonReq('PUT', { nameEn: 'X' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { id: number }).id).toBe(1)
  })
  it('PUT rejects empty update payloads', async () => {
    const r = await putLifecycle(jsonReq('PUT', {}), makeParams('1'))
    const body = (await r.json()) as {
      error: string
      issues: Array<{ message: string }>
    }

    expect(r.status).toBe(400)
    expect(body.error).toBe('Invalid request')
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'At least one of nameEn or nameSv must be provided',
        }),
      ]),
    )
    expect(mockUpdateLifecycle).not.toHaveBeenCalled()
  })
  it('PUT returns 404 when the specification lifecycle status is missing', async () => {
    mockUpdateLifecycle.mockResolvedValue(undefined)
    const r = await putLifecycle(
      jsonReq('PUT', { nameEn: 'Missing' }),
      makeParams('404'),
    )

    expect(r.status).toBe(404)
    await expect(r.json()).resolves.toEqual({ error: 'Not found' })
  })
  it('DELETE deletes', async () => {
    mockDeleteLifecycle.mockResolvedValue(1)
    const r = await deleteLifecycle(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true)
  })
  it('DELETE returns 404 when the specification lifecycle status is missing', async () => {
    mockDeleteLifecycle.mockResolvedValue(0)
    const r = await deleteLifecycle(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('404'),
    )

    expect(r.status).toBe(404)
    await expect(r.json()).resolves.toEqual({ error: 'Not found' })
  })

  it('DELETE returns 409 when the specification lifecycle status is in use', async () => {
    mockDeleteLifecycle.mockRejectedValue(
      new Error(
        'The DELETE statement conflicted with the REFERENCE constraint',
      ),
    )
    const r = await deleteLifecycle(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('1'),
    )

    expect(r.status).toBe(409)
    await expect(r.json()).resolves.toEqual({
      error: 'Cannot delete: specification lifecycle status is in use',
    })
    expect(
      auditState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('DELETE returns 500 when lifecycle deletion fails unexpectedly', async () => {
    mockDeleteLifecycle.mockRejectedValue(new Error('database offline'))
    const r = await deleteLifecycle(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('1'),
    )

    expect(r.status).toBe(500)
    await expect(r.json()).resolves.toEqual({ error: 'Internal server error' })
    expect(
      auditState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })
})

describe('specification-governance-object-types routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns governance object types', async () => {
    const r = await getGovernanceObjectTypes()
    const j = (await r.json()) as { governanceObjectTypes: { id: number }[] }
    expect(j.governanceObjectTypes).toHaveLength(1)
  })
  it('POST creates with 201', async () => {
    const r = await postGovernanceObjectType(
      new Request('http://l', {
        method: 'POST',
        body: '{"nameSv":"A","nameEn":"B"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(201)
  })
  it('PUT updates', async () => {
    mockUpdateGovernanceObjectType.mockResolvedValue({ id: 1 })
    const r = await putGovernanceObjectType(
      jsonReq('PUT', { nameEn: 'X' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { id: number }).id).toBe(1)
  })
  it('PUT rejects empty update payloads before opening the DB', async () => {
    const r = await putGovernanceObjectType(jsonReq('PUT', {}), makeParams('1'))

    expect(r.status).toBe(400)
    await expectInvalidRequest(r)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockUpdateGovernanceObjectType).not.toHaveBeenCalled()
  })
  it('DELETE deletes', async () => {
    mockDeleteGovernanceObjectType.mockResolvedValue(1)
    const r = await deleteGovernanceObjectType(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true)
  })

  it('DELETE returns 404 without audit when the governance object type is missing', async () => {
    mockDeleteGovernanceObjectType.mockResolvedValue(0)
    const r = await deleteGovernanceObjectType(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('404'),
    )

    expect(r.status).toBe(404)
    await expect(r.json()).resolves.toEqual({ error: 'Not found' })
    expect(
      auditState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid ids before opening the DB', async () => {
    const r = await putGovernanceObjectType(
      jsonReq('PUT', { nameEn: 'X' }),
      makeParams('abc'),
    )

    expect(r.status).toBe(400)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockUpdateGovernanceObjectType).not.toHaveBeenCalled()
  })

  it('returns 404 when updating a missing governance object type', async () => {
    mockUpdateGovernanceObjectType.mockResolvedValue(undefined)
    const r = await putGovernanceObjectType(
      jsonReq('PUT', { nameEn: 'Missing' }),
      makeParams('404'),
    )

    expect(r.status).toBe(404)
    await expect(r.json()).resolves.toEqual({ error: 'Not found' })
  })
})

describe('specification-item-statuses catalog routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns catalog statuses with linked item counts', async () => {
    const r = await getSpecItemStatuses()

    expect(r.status).toBe(200)
    await expect(r.json()).resolves.toEqual({
      statuses: [
        {
          id: 5,
          isDeviationStatus: true,
          linkedItemCount: 3,
          nameEn: 'Deviated',
          nameSv: 'Avviken',
        },
      ],
    })
  })

  it('GET by id returns linked requirement applications', async () => {
    const r = await getSpecItemStatus(
      new NextRequest('http://l', { method: 'GET' }),
      makeParams('5'),
    )

    expect(r.status).toBe(200)
    await expect(r.json()).resolves.toEqual({
      linkedItems: [],
      status: { id: 5 },
    })
  })

  it('PUT returns 404 when the catalog status is missing', async () => {
    mockUpdateSpecItemStatus.mockResolvedValue(undefined)
    const r = await putSpecItemStatus(
      jsonReq('PUT', { nameEn: 'Missing' }),
      makeParams('404'),
    )

    expect(r.status).toBe(404)
    await expect(r.json()).resolves.toEqual({ error: 'Not found' })
  })
})

describe('requirement-areas routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns areas', async () => {
    const r = await getReqAreas()
    const j = (await r.json()) as { areas: { id: number }[] }
    expect(j.areas).toHaveLength(1)
  })
  it('POST creates with 201', async () => {
    const r = await postReqArea(
      new Request('http://l', {
        method: 'POST',
        body: '{"name":"Test area","prefix":"TA"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(201)
  })
})

describe('requirement-areas/[id] routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('PUT updates', async () => {
    mockUpdateReqArea.mockResolvedValue({ id: 1 })
    const r = await putReqArea(jsonReq('PUT', { name: 'X' }), makeParams('1'))
    expect(((await r.json()) as { id: number }).id).toBe(1)
  })
  it('PUT returns 404 without audit when the requirement area is missing', async () => {
    mockUpdateReqArea.mockResolvedValue(undefined)
    const r = await putReqArea(
      jsonReq('PUT', { name: 'Missing' }),
      makeParams('404'),
    )

    expect(r.status).toBe(404)
    await expect(r.json()).resolves.toEqual({ error: 'Not found' })
    expect(
      auditState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })
  it('DELETE deletes', async () => {
    mockDeleteReqArea.mockResolvedValue(1)
    const r = await deleteReqArea(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true)
  })

  it('DELETE returns 404 without audit when the requirement area is missing', async () => {
    mockDeleteReqArea.mockResolvedValue(0)
    const r = await deleteReqArea(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('404'),
    )

    expect(r.status).toBe(404)
    await expect(r.json()).resolves.toEqual({ error: 'Not found' })
    expect(
      auditState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid ids before opening the DB', async () => {
    const r = await deleteReqArea(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('abc'),
    )

    expect(r.status).toBe(400)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockDeleteReqArea).not.toHaveBeenCalled()
  })
})

describe('requirement-specifications routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns specifications', async () => {
    const r = await getPkgs(new NextRequest('http://l'))
    const j = (await r.json()) as { specifications: { id: number }[] }
    expect(j.specifications).toHaveLength(1)
    expect(requirementsRuntimeState.listSpecifications).toHaveBeenCalledWith(
      { source: 'rest' },
      { includeRestFields: true, responseFormat: 'json' },
    )
  })
  it('GET maps runtime failures to the requirements error contract', async () => {
    requirementsRuntimeState.createRequirementsRestRuntime.mockRejectedValueOnce(
      validationError('Missing specification reference'),
    )

    const r = await getPkgs(new NextRequest('http://l'))

    expect(r.status).toBe(400)
    await expect(r.json()).resolves.toEqual({
      code: 'validation',
      error: 'Missing specification reference',
    })
  })
  it('POST creates with 201', async () => {
    const r = await postPkg(
      new NextRequest('http://l', {
        method: 'POST',
        body: '{"name":"A","uniqueId":"A"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(201)
  })
  it('POST accepts long existing-style specification slugs', async () => {
    const r = await postPkg(
      jsonReq('POST', {
        name: 'Playwright lifecycle',
        uniqueId: 'PLAYWRIGHT-LIFECYCLE-2026',
      }),
    )

    expect(r.status).toBe(201)
    expect(mockCreatePkg).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        uniqueId: 'PLAYWRIGHT-LIFECYCLE-2026',
      }),
    )
  })
  it('POST returns 400 for malformed JSON bodies', async () => {
    const r = await postPkg(
      new NextRequest('http://l', {
        method: 'POST',
        body: '{',
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    expect(r.status).toBe(400)
    await expect(r.json()).resolves.toMatchObject({
      error: 'Invalid request',
      issues: [
        {
          code: 'invalid_json',
          path: '$',
        },
      ],
    })
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockCreatePkg).not.toHaveBeenCalled()
  })
  it.each([
    ['missing name', { uniqueId: 'VALID-SLUG' }, 'name'],
    ['empty name', { name: '', uniqueId: 'VALID-SLUG' }, 'name'],
    ['empty uniqueId', { name: 'A', uniqueId: '' }, 'uniqueId'],
  ])('POST rejects %s', async (_label, body, path) => {
    const r = await postPkg(jsonReq('POST', body))

    expect(r.status).toBe(400)
    await expectInvalidRequest(r, path)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockCreatePkg).not.toHaveBeenCalled()
  })
  it.each([
    ['lowercase', 'lowercase'],
    ['spaces', 'VALID SLUG'],
    ['invalid punctuation', 'VALID_SLUG'],
    ['repeated hyphens', 'VALID--SLUG'],
    ['leading hyphen', '-VALID-SLUG'],
    ['trailing hyphen', 'VALID-SLUG-'],
    ['numeric only', '123'],
    ['oversize', 'A'.repeat(451)],
  ])('POST rejects invalid uniqueId: %s', async (_label, uniqueId) => {
    const r = await postPkg(jsonReq('POST', { name: 'A', uniqueId }))

    expect(r.status).toBe(400)
    await expectInvalidRequest(r, 'uniqueId')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockCreatePkg).not.toHaveBeenCalled()
  })
  it('POST passes specification lead fields through as an HSA-ID/name pair', async () => {
    const r = await postPkg(
      jsonReq('POST', {
        name: 'A',
        uniqueId: 'A',
        responsibleHsaId: 'SE5560000001-ada1',
        responsibleDisplayName: 'Ada Admin',
        canResponsibleGenerateAi: true,
      }),
    )

    expect(r.status).toBe(201)
    expect(mockCreatePkg).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        responsibleHsaId: 'SE5560000001-ada1',
        responsibleDisplayName: 'Ada Admin',
        canResponsibleGenerateAi: true,
      }),
    )
  })
  it('POST rejects a specification lead HSA-ID without a specification lead name', async () => {
    const r = await postPkg(
      jsonReq('POST', {
        name: 'A',
        uniqueId: 'A',
        responsibleHsaId: 'SE5560000001-ada1',
      }),
    )

    expect(r.status).toBe(400)
    await expectInvalidRequest(r, 'responsibleDisplayName')
    expect(mockCreatePkg).not.toHaveBeenCalled()
  })
  it('POST rejects a specification lead name without a specification lead HSA-ID', async () => {
    const r = await postPkg(
      jsonReq('POST', {
        name: 'A',
        uniqueId: 'A',
        responsibleDisplayName: 'Ada Lovelace',
      }),
    )

    expect(r.status).toBe(400)
    await expectInvalidRequest(r, 'responsibleHsaId')
    expect(mockCreatePkg).not.toHaveBeenCalled()
  })
  it('PUT updates', async () => {
    mockUpdatePkg.mockResolvedValue({ id: 1 })
    const r = await putPkg(jsonReq('PUT', { name: 'X' }), makeParams('1'))
    await expect(r.json()).resolves.toEqual({ id: 1 })
  })
  it('PUT rejects invalid updated uniqueId before persistence', async () => {
    const r = await putPkg(jsonReq('PUT', { uniqueId: '123' }), makeParams('1'))

    expect(r.status).toBe(400)
    await expectInvalidRequest(r, 'uniqueId')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockUpdatePkg).not.toHaveBeenCalled()
  })
  it('PUT updates specification lead and AI permission fields', async () => {
    mockUpdatePkg.mockResolvedValue({ id: 1 })
    const r = await putPkg(
      jsonReq('PUT', {
        responsibleHsaId: 'SE5560000001-rita1',
        responsibleDisplayName: 'Rita Reviewer',
        canResponsibleGenerateAi: true,
      }),
      makeParams('1'),
    )

    expect(r.status).toBe(200)
    expect(mockUpdatePkg).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({
        responsibleHsaId: 'SE5560000001-rita1',
        responsibleDisplayName: 'Rita Reviewer',
        canResponsibleGenerateAi: true,
      }),
    )
  })
  it('PUT clears the specification lead fields as a pair', async () => {
    mockUpdatePkg.mockResolvedValue({ id: 1 })
    const r = await putPkg(
      jsonReq('PUT', {
        responsibleDisplayName: '',
      }),
      makeParams('1'),
    )

    expect(r.status).toBe(200)
    expect(mockUpdatePkg).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({
        responsibleHsaId: null,
        responsibleDisplayName: null,
        canResponsibleGenerateAi: false,
      }),
    )
  })
  it('PUT clears the specification lead fields as a pair using HSA-ID', async () => {
    mockUpdatePkg.mockResolvedValue({ id: 1 })
    const r = await putPkg(
      jsonReq('PUT', {
        responsibleHsaId: '',
      }),
      makeParams('1'),
    )

    expect(r.status).toBe(200)
    expect(mockUpdatePkg).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({
        responsibleHsaId: null,
        responsibleDisplayName: null,
        canResponsibleGenerateAi: false,
      }),
    )
  })
  it('DELETE deletes', async () => {
    mockDeletePkg.mockResolvedValue(undefined)
    const r = await deletePkg(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true)
  })
})

describe('requirement-packages routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns requirementPackages', async () => {
    const r = await getRequirementPackages(new Request('http://l'))
    const j = (await r.json()) as { requirementPackages: { id: number }[] }
    expect(j.requirementPackages).toHaveLength(1)
  })
  it('GET returns 400 for invalid query parameters', async () => {
    const r = await getRequirementPackages(
      new Request('http://l?includeArchived=maybe'),
    )

    expect(r.status).toBe(400)
    await expectInvalidRequest(r)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })
  it('POST creates with 201', async () => {
    const r = await postRequirementPackage(
      new Request('http://l', {
        method: 'POST',
        body: '{"name":"A","leadHsaId":"SE5560000001-lead1","leadDisplayName":"Lead One"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(201)
  })
  it('POST returns 400 for invalid payload', async () => {
    const r = await postRequirementPackage(
      new Request('http://l', {
        method: 'POST',
        body: '{"name":"A","leadHsaId":"abc","leadDisplayName":"Lead One"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(400)
    await expectInvalidRequest(r)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })
  it('PUT updates', async () => {
    mockUpdateRequirementPackage.mockResolvedValue({ id: 1 })
    const r = await putRequirementPackage(
      jsonReq('PUT', { name: 'X' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { id: number }).id).toBe(1)
  })
  it('PUT returns 400 for empty updates', async () => {
    const r = await putRequirementPackage(jsonReq('PUT', {}), makeParams('1'))

    expect(r.status).toBe(400)
    await expectInvalidRequest(r)
    expect(mockUpdateRequirementPackage).not.toHaveBeenCalled()
  })
  it('DELETE deletes', async () => {
    mockDeleteRequirementPackage.mockResolvedValue({
      cleanup: {
        affectedAnswerIds: [],
        affectedRequirementIds: [],
        removedLinkCount: 0,
      },
      deletedCount: 1,
    })
    const r = await deleteRequirementPackage(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true)
  })

  it('DELETE returns 404 without audit when the requirement package is missing', async () => {
    mockDeleteRequirementPackage.mockResolvedValue({
      cleanup: {
        affectedAnswerIds: [],
        affectedRequirementIds: [],
        removedLinkCount: 0,
      },
      deletedCount: 0,
    })
    const r = await deleteRequirementPackage(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('404'),
    )

    expect(r.status).toBe(404)
    await expect(r.json()).resolves.toEqual({ error: 'Not found' })
    expect(
      auditState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })
})

describe('read-only taxonomy routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requirement-types GET returns types', async () => {
    const r = await getTypes()
    const j = (await r.json()) as { types: { id: number }[] }
    expect(j.types).toHaveLength(1)
  })

  it('quality-characteristics GET returns categories', async () => {
    const req = new NextRequest('http://l/api/quality-characteristics')
    const r = await getTypeCats(req)
    const j = (await r.json()) as { qualityCharacteristics: { id: number }[] }
    expect(j.qualityCharacteristics).toHaveLength(1)
  })

  it('quality-characteristics GET with typeId filter', async () => {
    const req = new NextRequest('http://l/api/quality-characteristics?typeId=1')
    const r = await getTypeCats(req)
    const j = (await r.json()) as { qualityCharacteristics: { id: number }[] }
    expect(j.qualityCharacteristics).toHaveLength(1)
  })

  it('quality-characteristics GET returns 400 for invalid typeId', async () => {
    const req = new NextRequest(
      'http://l/api/quality-characteristics?typeId=abc',
    )
    const r = await getTypeCats(req)
    expect(r.status).toBe(400)
    await expectInvalidRequest(r, 'typeId')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })

  it('quality-characteristics POST creates with 201', async () => {
    const r = await postTypeCat(
      new Request('http://l', {
        method: 'POST',
        body: JSON.stringify({
          chapterId: '3.1',
          nameSv: 'Sv',
          nameEn: 'En',
          requirementTypeId: 1,
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(201)
  })

  it('quality-characteristics POST returns 400 for invalid payload', async () => {
    const r = await postTypeCat(
      new Request('http://l', {
        method: 'POST',
        body: JSON.stringify({ nameSv: 'Sv' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(400)
    await expectInvalidRequest(r)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })

  it('quality-characteristics POST returns 400 for invalid parentId', async () => {
    const r = await postTypeCat(
      new Request('http://l', {
        method: 'POST',
        body: JSON.stringify({
          chapterId: '3.1',
          nameSv: 'Sv',
          nameEn: 'En',
          requirementTypeId: 1,
          parentId: 'abc',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(400)
    await expectInvalidRequest(r, 'parentId')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })

  it('quality-characteristics POST returns 400 for invalid chapterId', async () => {
    const r = await postTypeCat(
      new Request('http://l', {
        method: 'POST',
        body: JSON.stringify({
          chapterId: 'chapter-3',
          nameSv: 'Sv',
          nameEn: 'En',
          requirementTypeId: 1,
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(400)
    await expectInvalidRequest(r, 'chapterId')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })

  it('requirement-categories GET returns categories', async () => {
    const r = await getCats()
    const j = (await r.json()) as { categories: { id: number }[] }
    expect(j.categories).toHaveLength(1)
  })
})
