import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validationError } from '@/lib/requirements/errors'

/* ── shared request DB mocks ─────────────────────────────────────── */

const routeState = vi.hoisted(() => {
  const query = vi.fn(async () => [{ id: 1 }])
  const transactionDb = { query: vi.fn() }
  const transaction = vi.fn(async (callback: (manager: unknown) => unknown) =>
    callback(transactionDb),
  )
  return {
    getRequestSqlServerDataSource: vi.fn(() => ({ query, transaction })),
    query,
    transaction,
    transactionDb,
  }
})

const hsaLookupState = vi.hoisted(() => ({
  lookupHsaPerson: vi.fn(async (hsaId: string) => ({
    email: `${hsaId.toLowerCase()}@example.test`,
    givenName: 'Test',
    hsaId,
    middleName: null,
    surname: 'Person',
  })),
}))

const responsibilityPersonState = vi.hoisted(() => ({
  getRequirementResponsibilityPerson: vi.fn(
    async (..._args: unknown[]) => null as unknown,
  ),
  upsertRequirementResponsibilityPerson: vi.fn(async () => undefined),
}))

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
  recordDelegatedPrivilegedActionSucceeded: vi.fn(),
}))

const actionAuditState = vi.hoisted(() => ({
  recordAllowedActionAuditEvent: vi.fn(async () => undefined),
  recordDeniedActionAuditEvent: vi.fn(async () => undefined),
}))

const requirementsRuntimeState = vi.hoisted(() => {
  const listSpecifications = vi.fn(async () => ({
    message: 'ok',
    specifications: [{ id: 1 }],
  }))
  return {
    createRequirementsRestRuntime: vi.fn(async () => ({
      context: {
        actor: {
          displayName: 'Route Tester',
          hsaId: 'SE5560000001-route',
          id: 'route-test',
          isAuthenticated: true,
          roles: [],
          source: 'oidc',
        },
        correlationId: 'correlation-taxonomy',
        requestId: 'request-taxonomy',
        source: 'rest',
      },
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

const cleanupAuditState = vi.hoisted(() => ({
  recordRequirementSelectionCleanupAudit: vi.fn(),
}))

const requirementAreaPermissionState = vi.hoisted(() => ({
  canAuthorAnyArea: vi.fn(async (..._args: unknown[]) => true),
  canAuthorArea: vi.fn(async (..._args: unknown[]) => true),
  canManageAreaCoAuthors: vi.fn(async (..._args: unknown[]) => true),
}))

const specificationPermissionState = vi.hoisted(() => ({
  canAuthorSpecification: vi.fn(async (..._args: unknown[]) => true),
  canManageSpecificationAssignments: vi.fn(async (..._args: unknown[]) => true),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/hsa/person-lookup', () => ({
  lookupHsaPerson: hsaLookupState.lookupHsaPerson,
}))

vi.mock('@/lib/dal/requirement-responsibility-people', () => ({
  getRequirementResponsibilityPerson:
    responsibilityPersonState.getRequirementResponsibilityPerson,
  upsertRequirementResponsibilityPerson:
    responsibilityPersonState.upsertRequirementResponsibilityPerson,
}))

vi.mock('@/lib/admin/privileged-audit', () => ({
  createAdminPrivilegedAuditContext:
    auditState.createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded:
    auditState.recordAdminPrivilegedActionSucceeded,
  recordDelegatedPrivilegedActionSucceeded:
    auditState.recordDelegatedPrivilegedActionSucceeded,
}))

vi.mock('@/lib/audit/action-audit', () => ({
  recordAllowedActionAuditEvent: actionAuditState.recordAllowedActionAuditEvent,
  recordDeniedActionAuditEvent: actionAuditState.recordDeniedActionAuditEvent,
}))

vi.mock('@/lib/audit/requirement-selection-cleanup-audit', () => ({
  recordRequirementSelectionCleanupAudit:
    cleanupAuditState.recordRequirementSelectionCleanupAudit,
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
  listAreas: async () => [{ id: 1, ownerHsaId: 'SE5560000001-route' }],
  listAreaIdsActorCanAuthor: async () => [1],
  canAuthorAnyArea: (...a: unknown[]) =>
    requirementAreaPermissionState.canAuthorAnyArea(...a),
  canAuthorArea: (...a: unknown[]) =>
    requirementAreaPermissionState.canAuthorArea(...a),
  canManageAreaCoAuthors: (...a: unknown[]) =>
    requirementAreaPermissionState.canManageAreaCoAuthors(...a),
  createArea: async () => ({ id: 2 }),
  getAreaById: async (_db: unknown, id: number) => (id === 404 ? null : { id }),
  updateArea: (...a: unknown[]) => mockUpdateReqArea(...a),
  updateAreaWithOwnerCheck: (...a: unknown[]) => mockUpdateReqArea(...a),
  deleteArea: (...a: unknown[]) => mockDeleteReqArea(...a),
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
const mockUpdateSpecResponsible = vi.fn()
const mockReplaceSpecificationCoAuthors = vi.fn()
const mockDeletePkg = vi.fn()
vi.mock('@/lib/dal/requirements-specifications', () => ({
  listSpecifications: async () => [{ id: 1 }],
  canAuthorSpecification: (...a: unknown[]) =>
    specificationPermissionState.canAuthorSpecification(...a),
  canManageSpecificationAssignments: (...a: unknown[]) =>
    specificationPermissionState.canManageSpecificationAssignments(...a),
  createSpecification: (...a: unknown[]) => mockCreatePkg(...a),
  updateSpecification: (...a: unknown[]) => mockUpdatePkg(...a),
  updateSpecificationResponsible: (...a: unknown[]) =>
    mockUpdateSpecResponsible(...a),
  replaceSpecificationCoAuthors: (...a: unknown[]) =>
    mockReplaceSpecificationCoAuthors(...a),
  deleteSpecification: (...a: unknown[]) => mockDeletePkg(...a),
  getSpecificationById: async (_db: unknown, id: number) => ({ id }),
  getSpecificationBySlug: async () => null,
  isSlugTaken: async () => false,
}))

const mockCreateRequirementPackage = vi.fn(async (..._args: unknown[]) => ({
  id: 2,
}))
const mockUpdateRequirementPackage = vi.fn()
const mockDeleteRequirementPackage = vi.fn()
const mockArchiveRequirementPackage = vi.fn()
const mockListRequirementPackageCoAuthors = vi.fn<
  (
    ..._args: unknown[]
  ) => Promise<
    Array<{ displayName: string; email: string | null; hsaId: string }>
  >
>(async () => [])
const mockReplaceRequirementPackageCoAuthors = vi.fn()
const mockGetRequirementPackageById = vi.fn(
  async (
    ..._args: unknown[]
  ): Promise<{
    coAuthors?: Array<{
      createdAt: string
      displayName: string
      email: string | null
      hsaId: string
    }>
    id: number
    leadHsaId: string
  } | null> => ({
    id: 1,
    leadHsaId: 'SE5560000001-route',
  }),
)
vi.mock('@/lib/dal/requirement-packages', () => ({
  listRequirementPackages: async () => [{ id: 1 }],
  countLinkedRequirementsByPackage: async () => ({}),
  createRequirementPackage: (...a: unknown[]) =>
    mockCreateRequirementPackage(...a),
  getLinkedRequirementsForPackage: async () => [],
  getRequirementPackageById: (...a: unknown[]) =>
    mockGetRequirementPackageById(...a),
  listRequirementPackageCoAuthors: (...a: unknown[]) =>
    mockListRequirementPackageCoAuthors(...a),
  getRequirementPackageUsage: async () => ({
    answerLinkCount: 0,
    libraryRequirementCount: 0,
  }),
  updateRequirementPackage: (...a: unknown[]) =>
    mockUpdateRequirementPackage(...a),
  deleteRequirementPackage: (...a: unknown[]) =>
    mockDeleteRequirementPackage(...a),
  archiveRequirementPackage: (...a: unknown[]) =>
    mockArchiveRequirementPackage(...a),
  replaceRequirementPackageCoAuthors: (...a: unknown[]) =>
    mockReplaceRequirementPackageCoAuthors(...a),
}))

const mockListNormReferences = vi.fn(async (..._args: unknown[]) => [{ id: 1 }])
const mockCreateNormReference = vi.fn(async (..._args: unknown[]) => ({
  id: 2,
}))
const mockUpdateNormReference = vi.fn()
const mockDeleteNormReference = vi.fn()
const mockGetNormReferenceById = vi.fn()
const mockGetNormReferenceUsage = vi.fn(async (..._args: unknown[]) => ({
  libraryRequirementCount: 1,
  localRequirementCount: 2,
}))
const mockArchiveNormReference = vi.fn()
const mockReactivateNormReference = vi.fn()
vi.mock('@/lib/dal/norm-references', () => ({
  archiveNormReference: (...a: unknown[]) => mockArchiveNormReference(...a),
  countLinkedRequirements: async () => ({}),
  createNormReference: (...a: unknown[]) => mockCreateNormReference(...a),
  deleteNormReference: (...a: unknown[]) => mockDeleteNormReference(...a),
  getLinkedRequirements: async () => [],
  getNormReferenceById: (...a: unknown[]) => mockGetNormReferenceById(...a),
  getNormReferenceUsage: (...a: unknown[]) => mockGetNormReferenceUsage(...a),
  listNormReferences: (...a: unknown[]) => mockListNormReferences(...a),
  reactivateNormReference: (...a: unknown[]) =>
    mockReactivateNormReference(...a),
  updateNormReference: (...a: unknown[]) => mockUpdateNormReference(...a),
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
import { POST as archiveNormReference } from '@/app/api/norm-reference-actions/[id]/archive/route'
import { POST as reactivateNormReference } from '@/app/api/norm-references/[id]/reactivate/route'
import {
  DELETE as deleteNormReference,
  PUT as putNormReference,
} from '@/app/api/norm-references/[id]/route'
import {
  GET as getNormReferences,
  POST as postNormReference,
} from '@/app/api/norm-references/route'
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
import { POST as archiveRequirementPackage } from '@/app/api/requirement-packages/[id]/archive/route'
import {
  GET as getRequirementPackageCoAuthors,
  PUT as putRequirementPackageCoAuthors,
} from '@/app/api/requirement-packages/[id]/co-authors/route'
import {
  DELETE as deleteRequirementPackage,
  PUT as putRequirementPackage,
} from '@/app/api/requirement-packages/[id]/route'
import {
  GET as getRequirementPackages,
  POST as postRequirementPackage,
} from '@/app/api/requirement-packages/route'
import { POST as postRequirementResponsibilityPersonVerify } from '@/app/api/requirement-responsibility-people/verify/route'
import { GET as getTypes } from '@/app/api/requirement-types/route'
import { PUT as putSpecCoAuthors } from '@/app/api/requirements-specifications/[id]/co-authors/route'
import { PUT as putSpecResponsible } from '@/app/api/requirements-specifications/[id]/responsible/route'
import {
  DELETE as deletePkg,
  PUT as putPkg,
} from '@/app/api/requirements-specifications/[id]/route'
import {
  GET as getPkgs,
  POST as postPkg,
} from '@/app/api/requirements-specifications/route'
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

function specificationCreateBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'A',
    specificationLifecycleStatusId: 4,
    uniqueId: 'A',
    ...overrides,
  }
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

describe('requirement responsibility person verify route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.context.actor = {
      displayName: 'Route Tester',
      hsaId: 'SE5560000001-route',
      id: 'route-test',
      isAuthenticated: true,
      roles: ['RequirementsEditor'],
      source: 'oidc',
    }
    routeState.query.mockResolvedValue([{ id: 1 }])
    responsibilityPersonState.getRequirementResponsibilityPerson.mockImplementation(
      async (_db: unknown, hsaId: unknown) => {
        const value = String(hsaId)
        return {
          email: `${value.toLowerCase()}@example.test`,
          givenName: 'Verified',
          hsaId: value,
          middleName: null,
          surname: 'Person',
        }
      },
    )
    responsibilityPersonState.upsertRequirementResponsibilityPerson.mockResolvedValue(
      undefined,
    )
    requirementAreaPermissionState.canAuthorAnyArea.mockResolvedValue(true)
    requirementAreaPermissionState.canAuthorArea.mockResolvedValue(true)
    requirementAreaPermissionState.canManageAreaCoAuthors.mockResolvedValue(
      true,
    )
    specificationPermissionState.canAuthorSpecification.mockResolvedValue(true)
    specificationPermissionState.canManageSpecificationAssignments.mockResolvedValue(
      true,
    )
  })

  it('allows Admin to refresh-verify a requirement area owner HSA-id', async () => {
    authState.context.actor.roles = ['Admin']

    const r = await postRequirementResponsibilityPersonVerify(
      jsonReq('POST', {
        hsaId: 'SE5560000001-owner1',
        mode: 'refresh',
        purpose: 'requirement_area_owner',
      }),
    )

    expect(r.status).toBe(200)
    await expect(r.json()).resolves.toEqual({
      person: expect.objectContaining({
        displayName: 'Test Person',
        hsaId: 'SE5560000001-owner1',
      }),
    })
    expect(hsaLookupState.lookupHsaPerson).toHaveBeenCalledWith(
      'SE5560000001-owner1',
    )
    expect(
      responsibilityPersonState.upsertRequirementResponsibilityPerson,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ hsaId: 'SE5560000001-owner1' }),
    )
  })

  it('reuses a local responsibility person without HSA lookup on blur mode', async () => {
    authState.context.actor.roles = ['Admin']
    responsibilityPersonState.getRequirementResponsibilityPerson.mockResolvedValueOnce(
      {
        email: 'local.owner@example.test',
        givenName: 'Local',
        hsaId: 'SE5560000001-owner1',
        middleName: null,
        surname: 'Owner',
      },
    )

    const r = await postRequirementResponsibilityPersonVerify(
      jsonReq('POST', {
        hsaId: 'SE5560000001-owner1',
        mode: 'reuse_local',
        purpose: 'requirement_area_owner',
      }),
    )

    expect(r.status).toBe(200)
    await expect(r.json()).resolves.toEqual({
      person: expect.objectContaining({
        displayName: 'Local Owner',
        email: 'local.owner@example.test',
        hsaId: 'SE5560000001-owner1',
      }),
    })
    expect(hsaLookupState.lookupHsaPerson).not.toHaveBeenCalled()
    expect(
      responsibilityPersonState.upsertRequirementResponsibilityPerson,
    ).not.toHaveBeenCalled()
  })

  it('rejects non-Admin requirement area owner verification before HSA lookup', async () => {
    authState.context.actor.roles = []

    const r = await postRequirementResponsibilityPersonVerify(
      jsonReq('POST', {
        hsaId: 'SE5560000001-owner1',
        mode: 'refresh',
        purpose: 'requirement_area_owner',
      }),
    )

    expect(r.status).toBe(403)
    expect(hsaLookupState.lookupHsaPerson).not.toHaveBeenCalled()
  })

  it('allows current requirement area owner to verify a new owner for handover', async () => {
    authState.context.actor.roles = []
    requirementAreaPermissionState.canManageAreaCoAuthors.mockResolvedValueOnce(
      true,
    )

    const r = await postRequirementResponsibilityPersonVerify(
      jsonReq('POST', {
        hsaId: 'SE5560000001-owner2',
        mode: 'refresh',
        purpose: 'requirement_area_owner',
        scopeId: 7,
      }),
    )

    expect(r.status).toBe(200)
    expect(
      requirementAreaPermissionState.canManageAreaCoAuthors,
    ).toHaveBeenCalledWith(expect.anything(), 7, 'SE5560000001-route', false)
    expect(hsaLookupState.lookupHsaPerson).toHaveBeenCalledWith(
      'SE5560000001-owner2',
    )
  })

  it('requires scope for requirement area co-author verification', async () => {
    const r = await postRequirementResponsibilityPersonVerify(
      jsonReq('POST', {
        hsaId: 'SE5560000001-coa1',
        mode: 'refresh',
        purpose: 'requirement_area_co_author',
      }),
    )

    expect(r.status).toBe(403)
    expect(
      requirementAreaPermissionState.canManageAreaCoAuthors,
    ).not.toHaveBeenCalled()
    expect(hsaLookupState.lookupHsaPerson).not.toHaveBeenCalled()
  })

  it('checks requirement area manager permission before co-author verification lookup', async () => {
    requirementAreaPermissionState.canManageAreaCoAuthors.mockResolvedValueOnce(
      true,
    )

    const r = await postRequirementResponsibilityPersonVerify(
      jsonReq('POST', {
        hsaId: 'SE5560000001-coa1',
        mode: 'refresh',
        purpose: 'requirement_area_co_author',
        scopeId: 7,
      }),
    )

    expect(r.status).toBe(200)
    expect(
      requirementAreaPermissionState.canManageAreaCoAuthors,
    ).toHaveBeenCalledWith(expect.anything(), 7, 'SE5560000001-route', false)
    expect(hsaLookupState.lookupHsaPerson).toHaveBeenCalledWith(
      'SE5560000001-coa1',
    )
  })

  it('rejects requirement area co-author verification for content-only co-authors', async () => {
    requirementAreaPermissionState.canManageAreaCoAuthors.mockResolvedValueOnce(
      false,
    )

    const r = await postRequirementResponsibilityPersonVerify(
      jsonReq('POST', {
        hsaId: 'SE5560000001-coa1',
        mode: 'refresh',
        purpose: 'requirement_area_co_author',
        scopeId: 7,
      }),
    )

    expect(r.status).toBe(403)
    expect(hsaLookupState.lookupHsaPerson).not.toHaveBeenCalled()
  })

  it('checks specification assignment manager permission before scoped responsible verification lookup', async () => {
    specificationPermissionState.canManageSpecificationAssignments.mockResolvedValueOnce(
      false,
    )

    const r = await postRequirementResponsibilityPersonVerify(
      jsonReq('POST', {
        hsaId: 'SE5560000001-spec1',
        mode: 'refresh',
        purpose: 'requirements_specification_responsible',
        scopeId: 9,
      }),
    )

    expect(r.status).toBe(403)
    expect(
      specificationPermissionState.canManageSpecificationAssignments,
    ).toHaveBeenCalledWith(expect.anything(), 9, 'SE5560000001-route', false)
    expect(hsaLookupState.lookupHsaPerson).not.toHaveBeenCalled()
  })

  it('allows specification responsibility verification without scope for the actor on create', async () => {
    const r = await postRequirementResponsibilityPersonVerify(
      jsonReq('POST', {
        hsaId: 'SE5560000001-route',
        mode: 'refresh',
        purpose: 'requirements_specification_responsible',
      }),
    )

    expect(r.status).toBe(200)
    expect(
      specificationPermissionState.canManageSpecificationAssignments,
    ).not.toHaveBeenCalled()
    expect(hsaLookupState.lookupHsaPerson).toHaveBeenCalledWith(
      'SE5560000001-route',
    )
  })

  it('requires scope for specification responsibility verification of another HSA-id before lookup', async () => {
    const r = await postRequirementResponsibilityPersonVerify(
      jsonReq('POST', {
        hsaId: 'SE5560000001-spec1',
        mode: 'refresh',
        purpose: 'requirements_specification_responsible',
      }),
    )

    expect(r.status).toBe(403)
    expect(
      specificationPermissionState.canManageSpecificationAssignments,
    ).not.toHaveBeenCalled()
    expect(hsaLookupState.lookupHsaPerson).not.toHaveBeenCalled()
  })
})

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
    const r = await getReqAreas(new Request('http://l/api/requirement-areas'))
    const j = (await r.json()) as { areas: { id: number }[] }
    expect(j.areas).toHaveLength(1)
  })
  it('POST creates with 201', async () => {
    const r = await postReqArea(
      new Request('http://l', {
        method: 'POST',
        body: '{"name":"Test area","prefix":"TA","ownerHsaId":"SE5560000001-ta1"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(201)
  })
})

describe('requirement-areas/[id] routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.context.actor = {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc',
    }
    requirementAreaPermissionState.canManageAreaCoAuthors.mockResolvedValue(
      true,
    )
  })

  it('PUT updates', async () => {
    mockUpdateReqArea.mockResolvedValue({ id: 1 })
    const r = await putReqArea(jsonReq('PUT', { name: 'X' }), makeParams('1'))
    expect(((await r.json()) as { id: number }).id).toBe(1)
  })
  it('PUT allows the current requirement area owner without Admin', async () => {
    authState.context.actor = {
      displayName: 'Olle Owner',
      hsaId: 'SE5560000001-owner1',
      id: 'owner-sub',
      isAuthenticated: true,
      roles: [],
      source: 'oidc',
    }
    requirementAreaPermissionState.canManageAreaCoAuthors.mockResolvedValueOnce(
      true,
    )
    mockUpdateReqArea.mockResolvedValue({ id: 1 })

    const r = await putReqArea(
      jsonReq('PUT', { description: 'Updated' }),
      makeParams('1'),
    )

    expect(r.status).toBe(200)
    expect(
      requirementAreaPermissionState.canManageAreaCoAuthors,
    ).toHaveBeenCalledWith(expect.anything(), 1, 'SE5560000001-owner1', false)
    expect(mockUpdateReqArea).toHaveBeenCalled()
  })
  it('PUT returns 403 when the actor is neither Admin nor current owner', async () => {
    authState.context.actor = {
      displayName: 'Other User',
      hsaId: 'SE5560000001-other1',
      id: 'other-sub',
      isAuthenticated: true,
      roles: [],
      source: 'oidc',
    }
    requirementAreaPermissionState.canManageAreaCoAuthors.mockResolvedValueOnce(
      false,
    )

    const r = await putReqArea(jsonReq('PUT', { name: 'X' }), makeParams('1'))

    expect(r.status).toBe(403)
    expect(mockUpdateReqArea).not.toHaveBeenCalled()
  })
  it('PUT rejects changing the owner to an existing area co-author', async () => {
    mockUpdateReqArea.mockRejectedValueOnce(
      validationError(
        'Requirement area owner cannot also be requirement area co-author',
        { reason: 'area_owner_cannot_be_co_author' },
      ),
    )

    const r = await putReqArea(
      jsonReq('PUT', { ownerHsaId: 'SE5560000001-coa1' }),
      makeParams('1'),
    )

    expect(r.status).toBe(400)
    await expect(r.json()).resolves.toMatchObject({
      error: 'Requirement area owner cannot also be requirement area co-author',
    })
    expect(mockUpdateReqArea).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ ownerHsaId: 'SE5560000001-coa1' }),
    )
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
    authState.context.actor = {
      displayName: 'Route Tester',
      hsaId: 'SE5560000001-route',
      id: 'route-test',
      isAuthenticated: true,
      roles: ['RequirementsEditor'],
      source: 'oidc',
    }
    routeState.query.mockResolvedValue([])
    specificationPermissionState.canAuthorSpecification.mockResolvedValue(true)
    specificationPermissionState.canManageSpecificationAssignments.mockResolvedValue(
      true,
    )
  })

  it('GET returns specifications', async () => {
    const r = await getPkgs(new NextRequest('http://l'))
    const j = (await r.json()) as {
      collectionPermissions: { canCreateSpecification: boolean }
      specifications: { id: number }[]
    }
    expect(j.specifications).toHaveLength(1)
    expect(j.collectionPermissions).toEqual({ canCreateSpecification: true })
    expect(requirementsRuntimeState.listSpecifications).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'rest' }),
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
        body: JSON.stringify(specificationCreateBody()),
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(201)
  })
  it('POST denies authenticated actors without a verified HSA-id', async () => {
    Object.assign(authState.context.actor, { hsaId: null })

    const r = await postPkg(
      jsonReq('POST', {
        name: 'A',
        specificationLifecycleStatusId: 4,
        uniqueId: 'A',
      }),
    )

    expect(r.status).toBe(403)
    await expect(r.json()).resolves.toMatchObject({
      code: 'forbidden',
      error: 'Forbidden',
    })
    expect(mockCreatePkg).not.toHaveBeenCalled()
    expect(actionAuditState.recordDeniedActionAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actor: expect.objectContaining({ hsaId: null }),
      }),
      expect.objectContaining({
        action: 'specification.create.denied',
        denialReason: 'specification_create_requires_hsa_id',
      }),
    )
  })
  it('POST accepts long existing-style specification slugs', async () => {
    const r = await postPkg(
      jsonReq(
        'POST',
        specificationCreateBody({
          name: 'Playwright lifecycle',
          uniqueId: 'PLAYWRIGHT-LIFECYCLE-2026',
        }),
      ),
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
    ['missing', { name: 'A', uniqueId: 'A' }],
    [
      'null',
      {
        name: 'A',
        specificationLifecycleStatusId: null,
        uniqueId: 'A',
      },
    ],
  ])('POST rejects %s specification lifecycle status', async (_label, body) => {
    const r = await postPkg(jsonReq('POST', body))

    expect(r.status).toBe(400)
    await expectInvalidRequest(r, 'specificationLifecycleStatusId')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockCreatePkg).not.toHaveBeenCalled()
  })
  it.each([
    [
      'missing name',
      { specificationLifecycleStatusId: 4, uniqueId: 'VALID-SLUG' },
      'name',
    ],
    [
      'empty name',
      {
        name: '',
        specificationLifecycleStatusId: 4,
        uniqueId: 'VALID-SLUG',
      },
      'name',
    ],
    [
      'empty uniqueId',
      { name: 'A', specificationLifecycleStatusId: 4, uniqueId: '' },
      'uniqueId',
    ],
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
    const r = await postPkg(
      jsonReq('POST', specificationCreateBody({ uniqueId })),
    )

    expect(r.status).toBe(400)
    await expectInvalidRequest(r, 'uniqueId')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockCreatePkg).not.toHaveBeenCalled()
  })
  it('POST sets the specification lead from the authenticated actor', async () => {
    const r = await postPkg(jsonReq('POST', specificationCreateBody()))

    expect(r.status).toBe(201)
    expect(mockCreatePkg).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        responsibleHsaId: 'SE5560000001-route',
        responsiblePerson: expect.objectContaining({
          hsaId: 'SE5560000001-route',
        }),
      }),
    )
  })
  it('POST accepts the authenticated actor as the specification lead HSA-id', async () => {
    const r = await postPkg(
      jsonReq(
        'POST',
        specificationCreateBody({
          responsibleHsaId: 'SE5560000001-route',
        }),
      ),
    )

    expect(r.status).toBe(201)
    expect(mockCreatePkg).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        responsibleHsaId: 'SE5560000001-route',
        responsiblePerson: expect.objectContaining({
          hsaId: 'SE5560000001-route',
        }),
      }),
    )
  })
  it('POST rejects a client-selected specification lead HSA-id', async () => {
    const r = await postPkg(
      jsonReq(
        'POST',
        specificationCreateBody({
          responsibleHsaId: 'SE5560000001-ada1',
        }),
      ),
    )

    expect(r.status).toBe(400)
    await expect(r.json()).resolves.toMatchObject({
      code: 'validation',
      error:
        'Specification lead must match the authenticated actor when creating a specification',
    })
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockCreatePkg).not.toHaveBeenCalled()
  })
  it('POST rejects a client-selected specification lead display name', async () => {
    const r = await postPkg(
      jsonReq(
        'POST',
        specificationCreateBody({
          responsibleDisplayName: 'Ada Lovelace',
        }),
      ),
    )

    expect(r.status).toBe(400)
    await expectInvalidRequest(r)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
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
  it('PUT rejects clearing specification lifecycle status', async () => {
    const r = await putPkg(
      jsonReq('PUT', { specificationLifecycleStatusId: null }),
      makeParams('1'),
    )

    expect(r.status).toBe(400)
    await expectInvalidRequest(r, 'specificationLifecycleStatusId')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockUpdatePkg).not.toHaveBeenCalled()
  })
  it('PUT rejects specification assignment fields', async () => {
    const r = await putPkg(
      jsonReq('PUT', {
        responsibleHsaId: 'SE5560000001-rita1',
      }),
      makeParams('1'),
    )

    expect(r.status).toBe(400)
    await expectInvalidRequest(r)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockUpdatePkg).not.toHaveBeenCalled()
  })

  it('PUT responsible updates specification lead fields', async () => {
    mockUpdateSpecResponsible.mockResolvedValue({
      id: 1,
      responsibleHsaId: 'SE5560000001-rita1',
    })
    responsibilityPersonState.getRequirementResponsibilityPerson.mockResolvedValueOnce(
      {
        email: 'rita.reviewer@example.test',
        givenName: 'Rita',
        hsaId: 'SE5560000001-rita1',
        middleName: null,
        surname: 'Reviewer',
      },
    )
    const r = await putSpecResponsible(
      jsonReq('PUT', {
        responsibleHsaId: 'SE5560000001-rita1',
      }),
      makeParams('1'),
    )

    expect(r.status).toBe(200)
    expect(mockUpdateSpecResponsible).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({
        responsibleHsaId: 'SE5560000001-rita1',
        responsiblePerson: expect.objectContaining({
          hsaId: 'SE5560000001-rita1',
        }),
      }),
    )
  })
  it('PUT rejects legacy specification lead name fields', async () => {
    const r = await putPkg(
      jsonReq('PUT', {
        responsibleDisplayName: '',
      }),
      makeParams('1'),
    )

    expect(r.status).toBe(400)
    await expectInvalidRequest(r)
    expect(mockUpdatePkg).not.toHaveBeenCalled()
    expect(
      responsibilityPersonState.getRequirementResponsibilityPerson,
    ).not.toHaveBeenCalled()
  })
  it('PUT rejects clearing the specification lead HSA-id', async () => {
    const r = await putPkg(
      jsonReq('PUT', {
        responsibleHsaId: '',
      }),
      makeParams('1'),
    )

    expect(r.status).toBe(400)
    await expectInvalidRequest(r)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockUpdatePkg).not.toHaveBeenCalled()
  })
  it('PUT returns 403 without specification author permission', async () => {
    specificationPermissionState.canAuthorSpecification.mockResolvedValueOnce(
      false,
    )

    const r = await putPkg(jsonReq('PUT', { name: 'X' }), makeParams('1'))

    expect(r.status).toBe(403)
    expect(mockUpdatePkg).not.toHaveBeenCalled()
  })
  it('PUT responsible rejects changing to an existing specification co-author', async () => {
    mockUpdateSpecResponsible.mockRejectedValueOnce(
      validationError(
        'Specification lead cannot also be specification co-author',
        { reason: 'specification_lead_cannot_be_co_author' },
      ),
    )
    responsibilityPersonState.getRequirementResponsibilityPerson.mockResolvedValueOnce(
      {
        email: 'coa1@example.test',
        givenName: 'Co',
        hsaId: 'SE5560000001-coa1',
        middleName: null,
        surname: 'Author',
      },
    )

    const r = await putSpecResponsible(
      jsonReq('PUT', {
        responsibleHsaId: 'SE5560000001-coa1',
      }),
      makeParams('1'),
    )

    expect(r.status).toBe(400)
    await expect(r.json()).resolves.toMatchObject({
      error: 'Specification lead cannot also be specification co-author',
    })
    expect(mockUpdatePkg).not.toHaveBeenCalled()
  })
  it('PUT co-authors replaces specification co-author assignments', async () => {
    mockReplaceSpecificationCoAuthors.mockResolvedValue({
      coAuthorHsaIds: ['SE5560000001-coa1'],
      specificationId: 1,
    })
    responsibilityPersonState.getRequirementResponsibilityPerson.mockResolvedValueOnce(
      {
        email: 'coa1@example.test',
        givenName: 'Co',
        hsaId: 'SE5560000001-coa1',
        middleName: null,
        surname: 'Author',
      },
    )

    const r = await putSpecCoAuthors(
      jsonReq('PUT', {
        coAuthorHsaIds: ['SE5560000001-coa1'],
      }),
      makeParams('1'),
    )

    expect(r.status).toBe(200)
    expect(mockReplaceSpecificationCoAuthors).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({
        coAuthorHsaIds: ['SE5560000001-coa1'],
        coAuthorPeople: [
          expect.objectContaining({ hsaId: 'SE5560000001-coa1' }),
        ],
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
    Object.assign(authState.context.actor, {
      hsaId: 'SE5560000001-route',
      roles: ['Admin'],
    })
    routeState.query.mockResolvedValue([{ id: 1 }])
    mockGetRequirementPackageById.mockResolvedValue({
      id: 1,
      leadHsaId: 'SE5560000001-route',
    })
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
        body: '{"name":"A","purposeAndScope":"Purpose and scope"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(201)
  })
  it('POST allows requirement area authors and assigns actor as package lead', async () => {
    authState.context.actor.roles = []
    requirementAreaPermissionState.canAuthorAnyArea.mockResolvedValueOnce(true)

    const r = await postRequirementPackage(
      new Request('http://l', {
        method: 'POST',
        body: '{"name":"A","purposeAndScope":"Purpose and scope"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    expect(r.status).toBe(201)
    expect(
      requirementAreaPermissionState.canAuthorAnyArea,
    ).toHaveBeenCalledWith(expect.anything(), 'SE5560000001-route', false)
    expect(mockCreateRequirementPackage).toHaveBeenCalledWith(
      routeState.transactionDb,
      expect.objectContaining({
        leadHsaId: 'SE5560000001-route',
        name: 'A',
        purposeAndScope: 'Purpose and scope',
      }),
      { useExistingTransaction: true },
    )
  })
  it('POST creates requirement package and audit row in one transaction', async () => {
    const r = await postRequirementPackage(
      new Request('http://l', {
        method: 'POST',
        body: '{"name":"A","purposeAndScope":"Purpose and scope"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    expect(r.status).toBe(201)
    expect(routeState.transaction).toHaveBeenCalledTimes(1)
    expect(mockCreateRequirementPackage).toHaveBeenCalledWith(
      routeState.transactionDb,
      expect.objectContaining({
        leadHsaId: 'SE5560000001-route',
        name: 'A',
        purposeAndScope: 'Purpose and scope',
      }),
      { useExistingTransaction: true },
    )
    expect(actionAuditState.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      routeState.transactionDb,
      expect.anything(),
      expect.objectContaining({
        action: 'requirement_package.create',
        targetId: 2,
        targetKind: 'requirement_package',
      }),
    )
  })
  it('POST returns 400 for invalid payload', async () => {
    const r = await postRequirementPackage(
      new Request('http://l', {
        method: 'POST',
        body: '{"name":""}',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(r.status).toBe(400)
    await expectInvalidRequest(r)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })
  it('POST rejects package co-author fields in metadata payloads', async () => {
    const r = await postRequirementPackage(
      jsonReq('POST', {
        coAuthorHsaIds: ['SE5560000001-coa1'],
        name: 'A',
        purposeAndScope: 'Purpose and scope',
      }),
    )

    expect(r.status).toBe(400)
    await expectInvalidRequest(r)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockCreateRequirementPackage).not.toHaveBeenCalled()
  })
  it('POST rejects client-supplied package lead fields', async () => {
    const r = await postRequirementPackage(
      jsonReq('POST', {
        leadDisplayName: 'Client Lead',
        leadHsaId: 'SE5560000001-client1',
        name: 'A',
        purposeAndScope: 'Purpose and scope',
      }),
    )

    expect(r.status).toBe(400)
    await expectInvalidRequest(r)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockCreateRequirementPackage).not.toHaveBeenCalled()
  })
  it('POST returns 403 when actor lacks requirement area author access', async () => {
    authState.context.actor.roles = []
    requirementAreaPermissionState.canAuthorAnyArea.mockResolvedValueOnce(false)

    const r = await postRequirementPackage(
      jsonReq('POST', { name: 'A', purposeAndScope: 'Purpose and scope' }),
    )

    expect(r.status).toBe(403)
    await expect(r.json()).resolves.toMatchObject({
      code: 'forbidden',
      error: 'Forbidden',
    })
    expect(mockCreateRequirementPackage).not.toHaveBeenCalled()
  })
  it('POST returns 403 when actor HSA-id is missing', async () => {
    Object.assign(authState.context.actor, { hsaId: null, roles: [] })

    const r = await postRequirementPackage(
      jsonReq('POST', { name: 'A', purposeAndScope: 'Purpose and scope' }),
    )

    expect(r.status).toBe(403)
    await expect(r.json()).resolves.toMatchObject({
      code: 'forbidden',
      error: 'Forbidden',
    })
    expect(mockCreateRequirementPackage).not.toHaveBeenCalled()
  })
  it('PUT updates', async () => {
    mockUpdateRequirementPackage.mockResolvedValue({ id: 1 })
    const r = await putRequirementPackage(
      jsonReq('PUT', { name: 'X' }),
      makeParams('1'),
    )
    expect(((await r.json()) as { id: number }).id).toBe(1)
  })
  it('PUT allows clearing purpose and scope with an empty string', async () => {
    mockUpdateRequirementPackage.mockResolvedValue({ id: 1 })

    const r = await putRequirementPackage(
      jsonReq('PUT', { purposeAndScope: '' }),
      makeParams('1'),
    )

    expect(r.status).toBe(200)
    expect(mockUpdateRequirementPackage).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ purposeAndScope: '' }),
    )
  })
  it('PUT rejects changing the lead to an existing persisted co-author', async () => {
    mockGetRequirementPackageById.mockResolvedValueOnce({
      coAuthors: [
        {
          createdAt: '2026-05-02T08:00:00.000Z',
          displayName: 'Co Author',
          email: null,
          hsaId: 'SE5560000001-coa1',
        },
      ],
      id: 1,
      leadHsaId: 'SE5560000001-lead1',
    })

    const r = await putRequirementPackage(
      jsonReq('PUT', { leadHsaId: 'SE5560000001-coa1' }),
      makeParams('1'),
    )

    expect(r.status).toBe(400)
    await expect(r.json()).resolves.toMatchObject({
      error: 'Package lead cannot also be package co-author',
    })
    expect(mockUpdateRequirementPackage).not.toHaveBeenCalled()
  })
  it('PUT returns 400 for empty updates', async () => {
    const r = await putRequirementPackage(jsonReq('PUT', {}), makeParams('1'))

    expect(r.status).toBe(400)
    await expectInvalidRequest(r)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockUpdateRequirementPackage).not.toHaveBeenCalled()
  })
  it('PUT rejects package co-author fields in metadata payloads', async () => {
    const r = await putRequirementPackage(
      jsonReq('PUT', { coAuthorHsaIds: ['SE5560000001-coa1'] }),
      makeParams('1'),
    )

    expect(r.status).toBe(400)
    await expectInvalidRequest(r)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(mockUpdateRequirementPackage).not.toHaveBeenCalled()
  })
  it('GET co-authors returns package co-author assignments', async () => {
    mockListRequirementPackageCoAuthors.mockResolvedValueOnce([
      {
        displayName: 'Co Author',
        email: 'co.author@example.test',
        hsaId: 'SE5560000001-coa1',
      },
    ])

    const r = await getRequirementPackageCoAuthors(
      new NextRequest('http://l', { method: 'GET' }),
      makeParams('1'),
    )

    expect(r.status).toBe(200)
    await expect(r.json()).resolves.toMatchObject({
      coAuthors: [
        {
          displayName: 'Co Author',
          email: 'co.author@example.test',
          hsaId: 'SE5560000001-coa1',
        },
      ],
    })
    expect(mockListRequirementPackageCoAuthors).toHaveBeenCalledWith(
      expect.anything(),
      1,
    )
  })
  it('PUT co-authors replaces package co-author assignments', async () => {
    mockReplaceRequirementPackageCoAuthors.mockResolvedValue({
      coAuthorHsaIds: ['SE5560000001-coa1'],
      requirementPackageId: 1,
    })
    responsibilityPersonState.getRequirementResponsibilityPerson.mockResolvedValueOnce(
      {
        email: 'coa1@example.test',
        givenName: 'Co',
        hsaId: 'SE5560000001-coa1',
        middleName: null,
        surname: 'Author',
      },
    )

    const r = await putRequirementPackageCoAuthors(
      jsonReq('PUT', {
        coAuthorHsaIds: ['SE5560000001-coa1'],
      }),
      makeParams('1'),
    )

    expect(r.status).toBe(200)
    expect(mockReplaceRequirementPackageCoAuthors).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({
        coAuthorHsaIds: ['SE5560000001-coa1'],
        coAuthorPeople: [
          expect.objectContaining({ hsaId: 'SE5560000001-coa1' }),
        ],
      }),
    )
    expect(actionAuditState.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        action: 'requirement_package.co_authors.update',
        targetId: 1,
        targetKind: 'requirement_package',
      }),
    )
  })
  it('PUT co-authors rejects duplicate package co-author HSA-ids', async () => {
    const r = await putRequirementPackageCoAuthors(
      jsonReq('PUT', {
        coAuthorHsaIds: ['SE5560000001-coa1', 'SE5560000001-coa1'],
      }),
      makeParams('1'),
    )

    expect(r.status).toBe(400)
    await expectInvalidRequest(r, 'coAuthorHsaIds')
    expect(mockReplaceRequirementPackageCoAuthors).not.toHaveBeenCalled()
  })
  it('PUT co-authors rejects oversized package co-author lists', async () => {
    const r = await putRequirementPackageCoAuthors(
      jsonReq('PUT', {
        coAuthorHsaIds: Array.from(
          { length: 201 },
          (_value, index) => `SE5560000001-coa${index}`,
        ),
      }),
      makeParams('1'),
    )

    expect(r.status).toBe(400)
    await expectInvalidRequest(r, 'coAuthorHsaIds')
    expect(mockReplaceRequirementPackageCoAuthors).not.toHaveBeenCalled()
  })
  it('PUT returns 403 without Admin before updating', async () => {
    authState.context.actor.roles = []
    routeState.query.mockResolvedValueOnce([])

    const r = await putRequirementPackage(
      jsonReq('PUT', { name: 'X' }),
      makeParams('1'),
    )

    expect(r.status).toBe(403)
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
  it('DELETE still succeeds when cleanup audit recording fails', async () => {
    mockDeleteRequirementPackage.mockResolvedValue({
      cleanup: {
        affectedAnswerIds: [3],
        affectedRequirementIds: [7],
        removedLinkCount: 1,
      },
      deletedCount: 1,
    })
    cleanupAuditState.recordRequirementSelectionCleanupAudit.mockRejectedValueOnce(
      new Error('audit failed'),
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const r = await deleteRequirementPackage(
        new NextRequest('http://l', { method: 'DELETE' }),
        makeParams('1'),
      )

      expect(r.status).toBe(200)
      expect(((await r.json()) as { ok: boolean }).ok).toBe(true)
      expect(
        cleanupAuditState.recordRequirementSelectionCleanupAudit,
      ).toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to record requirement-selection cleanup audit after package deletion',
        expect.objectContaining({
          detail: expect.objectContaining({
            originAction: 'requirement_package.delete',
            originTargetId: 1,
            originTargetKind: 'requirement_package',
          }),
        }),
      )
    } finally {
      consoleError.mockRestore()
    }
  })
  it('DELETE returns 403 without Admin before deleting', async () => {
    authState.context.actor.roles = []

    const r = await deleteRequirementPackage(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('1'),
    )

    expect(r.status).toBe(403)
    expect(mockDeleteRequirementPackage).not.toHaveBeenCalled()
  })

  it('POST archive archives a requirement package', async () => {
    mockArchiveRequirementPackage.mockResolvedValue({
      cleanup: {
        affectedAnswerIds: [],
        affectedRequirementIds: [],
        removedLinkCount: 0,
      },
      requirementPackage: { id: 1 },
    })

    const r = await archiveRequirementPackage(
      new NextRequest('http://l', { method: 'POST' }),
      makeParams('1'),
    )

    expect(((await r.json()) as { id: number }).id).toBe(1)
  })

  it('POST archive returns 403 without Admin before archiving', async () => {
    authState.context.actor.roles = []

    const r = await archiveRequirementPackage(
      new NextRequest('http://l', { method: 'POST' }),
      makeParams('1'),
    )

    expect(r.status).toBe(403)
    expect(mockArchiveRequirementPackage).not.toHaveBeenCalled()
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
    mockGetRequirementPackageById.mockResolvedValueOnce(null)
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

describe('norm-references routes', () => {
  const setUnauthenticatedActor = () => {
    authState.context.actor = {
      ...authState.context.actor,
      isAuthenticated: false,
      roles: [],
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    authState.context.actor = {
      displayName: 'Route Tester',
      hsaId: 'SE5560000001-route',
      id: 'route-test',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc',
    }
    mockListNormReferences.mockResolvedValue([{ id: 1 }])
    mockCreateNormReference.mockResolvedValue({ id: 2 })
    mockUpdateNormReference.mockResolvedValue({ id: 1 })
    mockDeleteNormReference.mockResolvedValue(1)
    mockGetNormReferenceById.mockResolvedValue({ id: 1 })
    mockGetNormReferenceUsage.mockResolvedValue({
      libraryRequirementCount: 1,
      localRequirementCount: 2,
    })
    mockArchiveNormReference.mockResolvedValue({ id: 1, isArchived: true })
    mockReactivateNormReference.mockResolvedValue({
      id: 1,
      isArchived: false,
    })
  })

  it('GET defaults to active norm references', async () => {
    const r = await getNormReferences(
      new Request('http://l/api/norm-references'),
    )
    const j = (await r.json()) as { normReferences: { id: number }[] }

    expect(j.normReferences).toHaveLength(1)
    expect(mockListNormReferences).toHaveBeenCalledWith(expect.anything(), {
      includeArchived: false,
      includeIds: undefined,
    })
  })

  it('GET accepts includeArchived and includeIds', async () => {
    const r = await getNormReferences(
      new Request(
        'http://l/api/norm-references?includeArchived=true&includeIds=7&includeIds=8',
      ),
    )

    expect(r.status).toBe(200)
    expect(mockListNormReferences).toHaveBeenCalledWith(expect.anything(), {
      includeArchived: true,
      includeIds: [7, 8],
    })
  })

  it('GET returns 400 for invalid includeArchived', async () => {
    const r = await getNormReferences(
      new Request('http://l/api/norm-references?includeArchived=maybe'),
    )

    expect(r.status).toBe(400)
    await expectInvalidRequest(r)
    expect(mockListNormReferences).not.toHaveBeenCalled()
  })

  it('POST returns 401 without an authenticated actor before creating', async () => {
    setUnauthenticatedActor()

    const r = await postNormReference(
      jsonReq('POST', {
        issuer: 'ISO',
        name: 'ISO 27001',
        reference: 'ISO/IEC 27001:2022',
        type: 'Standard',
      }),
    )

    expect(r.status).toBe(401)
    expect(mockCreateNormReference).not.toHaveBeenCalled()
  })

  it('POST creates for an authenticated user', async () => {
    authState.context.actor.roles = []

    const r = await postNormReference(
      jsonReq('POST', {
        issuer: 'ISO',
        name: 'ISO 27001',
        reference: 'ISO/IEC 27001:2022',
        type: 'Standard',
      }),
    )

    expect(r.status).toBe(201)
    expect(mockCreateNormReference).toHaveBeenCalled()
  })

  it('PUT returns 403 without Admin before updating', async () => {
    authState.context.actor.roles = []

    const r = await putNormReference(
      jsonReq('PUT', { name: 'Updated' }),
      makeParams('1'),
    )

    expect(r.status).toBe(403)
    expect(mockUpdateNormReference).not.toHaveBeenCalled()
  })

  it('PUT updates with Admin', async () => {
    const r = await putNormReference(
      jsonReq('PUT', { name: 'Updated' }),
      makeParams('1'),
    )

    expect(r.status).toBe(200)
    expect(mockUpdateNormReference).toHaveBeenCalledWith(expect.anything(), 1, {
      name: 'Updated',
    })
  })

  it('DELETE returns 401 without an authenticated actor before deleting', async () => {
    setUnauthenticatedActor()

    const r = await deleteNormReference(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('1'),
    )

    expect(r.status).toBe(401)
    expect(mockDeleteNormReference).not.toHaveBeenCalled()
  })

  it('DELETE returns usage conflict when the norm reference is linked', async () => {
    mockDeleteNormReference.mockResolvedValue(0)

    const r = await deleteNormReference(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('1'),
    )

    expect(r.status).toBe(409)
    await expect(r.json()).resolves.toEqual({
      error: 'Norm reference is in use',
      usage: {
        libraryRequirementCount: 1,
        localRequirementCount: 2,
      },
    })
  })

  it('DELETE returns 404 when the norm reference is missing', async () => {
    mockDeleteNormReference.mockResolvedValue(0)
    mockGetNormReferenceById.mockResolvedValue(null)

    const r = await deleteNormReference(
      new NextRequest('http://l', { method: 'DELETE' }),
      makeParams('404'),
    )

    expect(r.status).toBe(404)
    await expect(r.json()).resolves.toEqual({ error: 'Not found' })
  })

  it('POST archive returns 401 without an authenticated actor before archiving', async () => {
    setUnauthenticatedActor()

    const r = await archiveNormReference(
      new NextRequest('http://l', { method: 'POST' }),
      makeParams('1'),
    )

    expect(r.status).toBe(401)
    expect(mockArchiveNormReference).not.toHaveBeenCalled()
  })

  it('POST archive requires Admin', async () => {
    authState.context.actor.roles = []

    const r = await archiveNormReference(
      new NextRequest('http://l', { method: 'POST' }),
      makeParams('1'),
    )

    expect(r.status).toBe(403)
    expect(mockArchiveNormReference).not.toHaveBeenCalled()
  })

  it('POST archive archives with Admin', async () => {
    const r = await archiveNormReference(
      new NextRequest('http://l', { method: 'POST' }),
      makeParams('1'),
    )

    expect(r.status).toBe(200)
    expect(mockArchiveNormReference).toHaveBeenCalledWith(expect.anything(), 1)
  })

  it('POST reactivate returns 401 without an authenticated actor before reactivating', async () => {
    setUnauthenticatedActor()

    const r = await reactivateNormReference(
      new NextRequest('http://l', { method: 'POST' }),
      makeParams('1'),
    )

    expect(r.status).toBe(401)
    expect(mockReactivateNormReference).not.toHaveBeenCalled()
  })

  it('POST reactivate requires Admin', async () => {
    authState.context.actor.roles = []

    const r = await reactivateNormReference(
      new NextRequest('http://l', { method: 'POST' }),
      makeParams('1'),
    )

    expect(r.status).toBe(403)
    expect(mockReactivateNormReference).not.toHaveBeenCalled()
  })

  it('POST reactivate reactivates with Admin', async () => {
    const r = await reactivateNormReference(
      new NextRequest('http://l', { method: 'POST' }),
      makeParams('1'),
    )

    expect(r.status).toBe(200)
    expect(mockReactivateNormReference).toHaveBeenCalledWith(
      expect.anything(),
      1,
    )
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
