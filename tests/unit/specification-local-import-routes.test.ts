import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_APPLICATION_SETTINGS } from '@/lib/application-settings'
import type { RequestContext } from '@/lib/requirements/auth'
import { jsonRequest } from '@/tests/unit/helpers/route-handler-test-helpers'

const routeState = vi.hoisted(() => ({
  assertAuthorized: vi.fn(),
  createRequestContext: vi.fn(),
  createRequirementsRestRuntime: vi.fn(),
  executeSpecificationLocalImport: vi.fn(),
  getApplicationSettings: vi.fn(),
  logSanitizedError: vi.fn(),
  previewSpecificationLocalImport: vi.fn(),
}))

const db = { query: vi.fn() }

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: vi.fn(async () => db),
}))

vi.mock('@/lib/dal/application-settings', () => ({
  getApplicationSettings: routeState.getApplicationSettings,
}))
vi.mock('@/lib/requirements/auth', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/requirements/auth')>()),
  createDefaultAuthorizationService: () => ({
    assertAuthorized: routeState.assertAuthorized,
  }),
  createRequestContext: routeState.createRequestContext,
}))
vi.mock('@/lib/audit/action-audit', () => ({
  recordDeniedActionAuditEvent: vi.fn(),
}))
vi.mock('@/lib/http/safe-errors', () => ({
  logSanitizedError: routeState.logSanitizedError,
}))
vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: routeState.createRequirementsRestRuntime,
}))

import { POST as legacyExecutePost } from '@/app/api/requirements-specifications/[id]/local-requirements/import/execute/route'
import { POST as legacyPreviewPost } from '@/app/api/requirements-specifications/[id]/local-requirements/import/preview/route'
import { POST as executePost } from '@/app/api/specification-local-requirements/import/execute/route'
import { POST as previewPost } from '@/app/api/specification-local-requirements/import/preview/route'

const context: RequestContext = {
  actor: {
    displayName: 'Requirements Editor',
    hsaId: 'SE5560000001-editor',
    id: 'editor-sub',
    isAuthenticated: true,
    roles: ['RequirementsEditor'],
    source: 'oidc',
  },
  correlationId: 'correlation-import-route',
  requestId: 'request-import-route',
  source: 'rest',
}

const payload = {
  requirements: [{ description: 'Local requirement' }],
  schemaVersion: 'requirement-import.v4',
}
const rows = [
  {
    description: 'Local requirement',
    reviewRowId: 'row-0',
    sourceIndex: 0,
  },
]

describe('specification-local import routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.getApplicationSettings.mockResolvedValue(
      DEFAULT_APPLICATION_SETTINGS,
    )
    routeState.createRequestContext.mockResolvedValue(context)
    routeState.previewSpecificationLocalImport.mockResolvedValue({
      previewToken: 'preview-token',
      rows: [],
      summary: { errorCount: 0, rowCount: 0, warningCount: 0 },
    })
    routeState.executeSpecificationLocalImport.mockResolvedValue({
      createdRows: [],
      mode: 'specification-local',
      summary: { createdCount: 0 },
    })
    routeState.createRequirementsRestRuntime.mockResolvedValue({
      context,
      service: {
        executeSpecificationLocalImport:
          routeState.executeSpecificationLocalImport,
        previewSpecificationLocalImport:
          routeState.previewSpecificationLocalImport,
      },
    })
  })

  it('previews an import whose specification is selected in the body', async () => {
    const response = await previewPost(
      jsonRequest('/api/specification-local-requirements/import/preview', {
        locale: 'sv',
        payload,
        specificationId: 7,
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      previewToken: 'preview-token',
    })
    expect(routeState.previewSpecificationLocalImport).toHaveBeenCalledWith(
      context,
      { locale: 'sv', payload, specificationId: 7 },
    )
    expect(routeState.assertAuthorized).toHaveBeenCalledWith(
      {
        kind: 'manage_specification_local_requirement',
        operation: 'create',
        specificationId: 7,
      },
      context,
    )
  })

  it('executes an import whose specification is selected in the body', async () => {
    const response = await executePost(
      jsonRequest('/api/specification-local-requirements/import/execute', {
        locale: 'en',
        previewToken: 'preview-token',
        rows,
        specificationId: 7,
      }),
    )

    expect(response.status).toBe(201)
    expect(routeState.executeSpecificationLocalImport).toHaveBeenCalledWith(
      context,
      {
        locale: 'en',
        previewToken: 'preview-token',
        rows: [
          {
            description: 'Local requirement',
            normReferenceIds: [],
            requirementPackageIds: [],
            reviewRowId: 'row-0',
            sourceIndex: 0,
            verifiable: false,
          },
        ],
        specificationId: 7,
      },
    )
  })

  it('previews an import whose specification is selected in the URL', async () => {
    const response = await legacyPreviewPost(
      jsonRequest(
        '/api/requirements-specifications/7/local-requirements/import/preview',
        { locale: 'en', payload },
      ),
      { params: Promise.resolve({ id: '7' }) },
    )

    expect(response.status).toBe(200)
    expect(routeState.previewSpecificationLocalImport).toHaveBeenCalledWith(
      context,
      { locale: 'en', payload, specificationId: 7 },
    )
  })

  it('executes an import whose specification is selected in the URL', async () => {
    const response = await legacyExecutePost(
      jsonRequest(
        '/api/requirements-specifications/7/local-requirements/import/execute',
        { locale: 'sv', previewToken: 'preview-token', rows },
      ),
      { params: Promise.resolve({ id: '7' }) },
    )

    expect(response.status).toBe(201)
    expect(routeState.executeSpecificationLocalImport).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ locale: 'sv', specificationId: 7 }),
    )
  })

  it.each([
    {
      invoke: (count: number) =>
        previewPost(
          jsonRequest('/api/specification-local-requirements/import/preview', {
            locale: 'en',
            payload: {
              requirements: Array.from({ length: count }, (_, index) => ({
                description: `Requirement ${index}`,
              })),
              schemaVersion: 'requirement-import.v4',
            },
            specificationId: 7,
          }),
        ),
      service: routeState.previewSpecificationLocalImport,
      variant: 'body-selected preview',
    },
    {
      invoke: (count: number) =>
        executePost(
          jsonRequest('/api/specification-local-requirements/import/execute', {
            locale: 'en',
            previewToken: 'preview-token',
            rows: Array.from({ length: count }, (_, index) => ({
              description: `Requirement ${index}`,
              reviewRowId: `row-${index}`,
              sourceIndex: index,
            })),
            specificationId: 7,
          }),
        ),
      service: routeState.executeSpecificationLocalImport,
      variant: 'body-selected execute',
    },
    {
      invoke: (count: number) =>
        legacyPreviewPost(
          jsonRequest(
            '/api/requirements-specifications/7/local-requirements/import/preview',
            {
              locale: 'en',
              payload: {
                requirements: Array.from({ length: count }, (_, index) => ({
                  description: `Requirement ${index}`,
                })),
                schemaVersion: 'requirement-import.v4',
              },
            },
          ),
          { params: Promise.resolve({ id: '7' }) },
        ),
      service: routeState.previewSpecificationLocalImport,
      variant: 'URL-selected preview',
    },
    {
      invoke: (count: number) =>
        legacyExecutePost(
          jsonRequest(
            '/api/requirements-specifications/7/local-requirements/import/execute',
            {
              locale: 'en',
              previewToken: 'preview-token',
              rows: Array.from({ length: count }, (_, index) => ({
                description: `Requirement ${index}`,
                reviewRowId: `row-${index}`,
                sourceIndex: index,
              })),
            },
          ),
          { params: Promise.resolve({ id: '7' }) },
        ),
      service: routeState.executeSpecificationLocalImport,
      variant: 'URL-selected execute',
    },
  ])(
    'accepts the exact live row budget and rejects one over before $variant mutation',
    async testCase => {
      routeState.getApplicationSettings.mockResolvedValue({
        ...DEFAULT_APPLICATION_SETTINGS,
        requirementImportMaxRows: 2,
      })

      expect((await testCase.invoke(2)).status).toBeLessThan(300)
      expect(testCase.service).toHaveBeenCalledOnce()
      testCase.service.mockClear()

      const over = await testCase.invoke(3)
      expect(over.status).toBe(422)
      await expect(over.json()).resolves.toMatchObject({
        code: 'import_row_count_cap_exceeded',
      })
      expect(testCase.service).not.toHaveBeenCalled()
    },
  )

  it.each([
    {
      invoke: () =>
        previewPost(
          jsonRequest('/api/specification-local-requirements/import/preview', {
            payload,
            specificationId: 7,
          }),
        ),
      reject: (error: Error) =>
        routeState.previewSpecificationLocalImport.mockRejectedValueOnce(error),
      secret: 'preview database secret',
      variant: 'body-selected preview',
    },
    {
      invoke: () =>
        executePost(
          jsonRequest('/api/specification-local-requirements/import/execute', {
            previewToken: 'preview-token',
            rows,
            specificationId: 7,
          }),
        ),
      reject: (error: Error) =>
        routeState.executeSpecificationLocalImport.mockRejectedValueOnce(error),
      secret: 'execute database secret',
      variant: 'body-selected execute',
    },
    {
      invoke: () =>
        legacyPreviewPost(
          jsonRequest(
            '/api/requirements-specifications/7/local-requirements/import/preview',
            { payload },
          ),
          { params: Promise.resolve({ id: '7' }) },
        ),
      reject: (error: Error) =>
        routeState.previewSpecificationLocalImport.mockRejectedValueOnce(error),
      secret: 'legacy preview database secret',
      variant: 'URL-selected preview',
    },
    {
      invoke: () =>
        legacyExecutePost(
          jsonRequest(
            '/api/requirements-specifications/7/local-requirements/import/execute',
            { previewToken: 'preview-token', rows },
          ),
          { params: Promise.resolve({ id: '7' }) },
        ),
      reject: (error: Error) =>
        routeState.executeSpecificationLocalImport.mockRejectedValueOnce(error),
      secret: 'legacy execute database secret',
      variant: 'URL-selected execute',
    },
  ])('maps $variant failures to a sanitized response', async testCase => {
    testCase.reject(new Error(testCase.secret))

    const response = await testCase.invoke()

    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain(testCase.secret)
    expect(routeState.logSanitizedError).toHaveBeenCalled()
  })
})
