import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestContext } from '@/lib/requirements/auth'

const routeMocks = vi.hoisted(() => ({
  configs: [] as Array<Record<string, unknown>>,
  createRequirementsRestRuntime: vi.fn(),
  executeLibraryImport: vi.fn(),
  previewLibraryImport: vi.fn(),
}))

vi.mock('@/lib/http/secure-mutation-route', () => ({
  requirementsMutationPolicy: (
    resolve: (input: { body: Record<string, unknown> }) => unknown,
  ) => resolve,
  secureMutationRoute: (config: Record<string, unknown>) => {
    routeMocks.configs.push(config)
    return Object.assign(
      async (request: Request) =>
        (
          config.handler as (input: {
            body: Record<string, unknown>
            context: RequestContext
            request: Request
          }) => Promise<Response>
        )({
          body: await request.json(),
          context: makeContext(true),
          request,
        }),
      { secureMutationRoute: true },
    )
  },
}))

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: routeMocks.createRequirementsRestRuntime,
}))

import { POST as executePost } from '@/app/api/requirements/import/execute/route'
import { POST as previewPost } from '@/app/api/requirements/import/preview/route'
import { GET as schemaGet } from '@/app/api/requirements/import/schema/route'
import { forbiddenError } from '@/lib/requirements/errors'

function makeContext(isAuthenticated: boolean): RequestContext {
  return {
    actor: {
      displayName: isAuthenticated ? 'Import Tester' : '',
      hsaId: isAuthenticated ? 'SE5560000001-import' : null,
      id: isAuthenticated ? 'import-test' : null,
      isAuthenticated,
      roles: isAuthenticated ? ['RequirementsEditor'] : [],
      source: isAuthenticated ? 'oidc' : 'anonymous',
    },
    correlationId: 'correlation-import-route',
    requestId: 'request-import-route',
    source: 'rest',
  }
}

function jsonRequest(path: string, body: Record<string, unknown>): Request {
  return new Request(`http://localhost${path}`, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
}

describe('requirements-library import routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeMocks.previewLibraryImport.mockResolvedValue({
      previewToken: 'preview-token',
      rows: [],
      summary: { errorCount: 0, rowCount: 0, warningCount: 0 },
    })
    routeMocks.executeLibraryImport.mockResolvedValue({
      createdRows: [],
      mode: 'library',
      summary: { createdCount: 0 },
    })
    routeMocks.createRequirementsRestRuntime.mockResolvedValue({
      context: makeContext(true),
      service: {
        executeLibraryImport: routeMocks.executeLibraryImport,
        previewLibraryImport: routeMocks.previewLibraryImport,
      },
    })
  })

  it('previews a library import and derives area authorization from its body', async () => {
    const payload = {
      requirements: [{ description: 'Requirement' }],
      schemaVersion: 'requirement-import.v3',
    }
    const response = await previewPost(
      jsonRequest('/api/requirements/import/preview', {
        areaId: 7,
        locale: 'sv',
        payload,
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      previewToken: 'preview-token',
    })
    expect(routeMocks.previewLibraryImport).toHaveBeenCalledWith(
      makeContext(true),
      { areaId: 7, locale: 'sv', payload },
    )
    const previewConfig = routeMocks.configs[0]
    expect(
      (previewConfig.policy as (input: unknown) => unknown)({
        body: { areaId: 7 },
      }),
    ).toEqual({ areaId: 7, kind: 'manage_requirement', operation: 'create' })
  })

  it('rejects a preview without an area before runtime work', async () => {
    const response = await previewPost(
      jsonRequest('/api/requirements/import/preview', {
        areaId: 0,
        locale: 'en',
        payload: { requirements: [], schemaVersion: 'requirement-import.v3' },
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'validation' })
    expect(routeMocks.createRequirementsRestRuntime).not.toHaveBeenCalled()
  })

  it('maps preview service failures to the public HTTP error', async () => {
    routeMocks.previewLibraryImport.mockRejectedValueOnce(forbiddenError())

    const response = await previewPost(
      jsonRequest('/api/requirements/import/preview', {
        areaId: 3,
        locale: 'en',
        payload: { requirements: [], schemaVersion: 'requirement-import.v3' },
      }),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ code: 'forbidden' })
  })

  it('executes an approved library preview and returns a created response', async () => {
    const rows = [{ sourceIndex: 0 }]
    const response = await executePost(
      jsonRequest('/api/requirements/import/execute', {
        areaId: 7,
        locale: 'en',
        previewToken: 'preview-token',
        rows,
      }),
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      mode: 'library',
      summary: { createdCount: 0 },
    })
    expect(routeMocks.executeLibraryImport).toHaveBeenCalledWith(
      makeContext(true),
      { areaId: 7, locale: 'en', previewToken: 'preview-token', rows },
    )
    const executeConfig = routeMocks.configs[1]
    expect(
      (executeConfig.policy as (input: unknown) => unknown)({
        body: { areaId: 7 },
      }),
    ).toEqual({ areaId: 7, kind: 'manage_requirement', operation: 'create' })
  })

  it('maps execute failures without leaking the internal exception', async () => {
    routeMocks.executeLibraryImport.mockRejectedValueOnce(
      new Error('database secret'),
    )

    const response = await executePost(
      jsonRequest('/api/requirements/import/execute', {
        areaId: 7,
        locale: 'en',
        previewToken: 'preview-token',
        rows: [],
      }),
    )

    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain(
      'database secret',
    )
  })

  it('serves the localized import schema to authenticated callers', async () => {
    const response = await schemaGet(
      new Request('http://localhost/api/requirements/import/schema?locale=sv'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe(
      'application/schema+json; charset=utf-8',
    )
    await expect(response.json()).resolves.toMatchObject({
      properties: { requirements: expect.any(Object) },
    })
  })

  it('defaults the import schema locale and rejects anonymous callers', async () => {
    const english = await schemaGet(
      new Request('http://localhost/api/requirements/import/schema?locale=de'),
    )
    expect(english.status).toBe(200)

    routeMocks.createRequirementsRestRuntime.mockResolvedValueOnce({
      context: makeContext(false),
    })
    const anonymous = await schemaGet(
      new Request('http://localhost/api/requirements/import/schema'),
    )
    expect(anonymous.status).toBe(401)
    await expect(anonymous.json()).resolves.toMatchObject({
      code: 'unauthorized',
    })
  })

  it('maps schema runtime failures to a sanitized response', async () => {
    routeMocks.createRequirementsRestRuntime.mockRejectedValueOnce(
      new Error('runtime secret'),
    )
    const response = await schemaGet(
      new Request('http://localhost/api/requirements/import/schema'),
    )

    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain(
      'runtime secret',
    )
  })
})
