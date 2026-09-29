import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestContext } from '@/lib/requirements/auth'
import { forbiddenError } from '@/lib/requirements/errors'

const routeMocks = vi.hoisted(() => ({
  createRequirementsRestRuntime: vi.fn(),
  getImportAiRequestTemplate: vi.fn(),
}))

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: routeMocks.createRequirementsRestRuntime,
}))

import { GET } from '@/app/api/requirements/import/ai-request-template/route'

const ROUTE_URL = 'http://localhost/api/requirements/import/ai-request-template'

function makeContext(isAuthenticated: boolean): RequestContext {
  return {
    actor: {
      displayName: isAuthenticated ? 'Route Tester' : '',
      hsaId: isAuthenticated ? 'SE5560000001-route' : null,
      id: isAuthenticated ? 'route-test' : null,
      isAuthenticated,
      roles: isAuthenticated ? ['RequirementsEditor'] : [],
      source: isAuthenticated ? 'oidc' : 'anonymous',
    },
    correlationId: 'correlation-ai-request-template',
    requestId: 'request-ai-request-template',
    source: 'rest',
  }
}

function useRuntime(isAuthenticated = true) {
  const context = makeContext(isAuthenticated)
  routeMocks.createRequirementsRestRuntime.mockResolvedValue({
    context,
    service: {
      getImportAiRequestTemplate: routeMocks.getImportAiRequestTemplate,
    },
  })
  return context
}

describe('GET /api/requirements/import/ai-request-template', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeMocks.getImportAiRequestTemplate.mockResolvedValue({
      aiRequestTemplate: '===== BÖRJAN =====\nMall\n===== SLUT =====\n',
    })
  })

  it('returns the template as Markdown with a UTF-8 BOM and no-store', async () => {
    const context = useRuntime()

    const response = await GET(
      new Request(`${ROUTE_URL}?locale=sv&kind=requirements_library`),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Content-Type')).toBe(
      'text/markdown; charset=utf-8',
    )
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(bytes.slice(3))).toBe(
      '===== BÖRJAN =====\nMall\n===== SLUT =====\n',
    )
    expect(routeMocks.getImportAiRequestTemplate).toHaveBeenCalledWith(
      context,
      { destinationKind: 'requirements_library', locale: 'sv' },
    )
  })

  it('serves the specification template without a specificationId and defaults to English', async () => {
    const context = useRuntime()

    const response = await GET(
      new Request(`${ROUTE_URL}?locale=de&kind=requirements_specification`),
    )

    expect(response.status).toBe(200)
    expect(routeMocks.getImportAiRequestTemplate).toHaveBeenCalledWith(
      context,
      { destinationKind: 'requirements_specification', locale: 'en' },
    )
  })

  it.each([
    ['a missing kind', '?locale=sv'],
    ['an unknown kind', '?locale=sv&kind=requirements_area'],
  ])('rejects %s as a validation error', async (_name, query) => {
    useRuntime()

    const response = await GET(new Request(`${ROUTE_URL}${query}`))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: 'validation',
      error: expect.stringContaining('kind=requirements_library'),
    })
    expect(routeMocks.getImportAiRequestTemplate).not.toHaveBeenCalled()
  })

  it('rejects anonymous requests before building the template', async () => {
    useRuntime(false)

    const response = await GET(
      new Request(`${ROUTE_URL}?kind=requirements_library`),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      code: 'unauthorized',
      error: 'Authentication is required',
    })
    expect(routeMocks.getImportAiRequestTemplate).not.toHaveBeenCalled()
  })

  it('returns the service authorization failure', async () => {
    useRuntime()
    routeMocks.getImportAiRequestTemplate.mockRejectedValue(forbiddenError())

    const response = await GET(
      new Request(`${ROUTE_URL}?kind=requirements_library`),
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})
