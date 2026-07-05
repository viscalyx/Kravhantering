import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestContext } from '@/lib/requirements/auth'

const routeMocks = vi.hoisted(() => ({
  createRequirementsRestRuntime: vi.fn(),
  getImportInstruction: vi.fn(),
}))

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: routeMocks.createRequirementsRestRuntime,
}))

import { GET } from '@/app/api/requirements/import/instruction/route'

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
    correlationId: 'correlation-import-instruction',
    requestId: 'request-import-instruction',
    source: 'rest',
  }
}

describe('GET /api/requirements/import/instruction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeMocks.getImportInstruction.mockResolvedValue({
      importInstruction: '# Importinstruktion',
    })
  })

  it('returns the authenticated import instruction as Markdown with no-store', async () => {
    const context = makeContext(true)
    routeMocks.createRequirementsRestRuntime.mockResolvedValue({
      context,
      service: {
        getImportInstruction: routeMocks.getImportInstruction,
      },
    })

    const response = await GET(
      new Request(
        'http://localhost/api/requirements/import/instruction?locale=sv',
      ),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Content-Type')).toBe(
      'text/markdown; charset=utf-8',
    )
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('# Importinstruktion')
    expect(routeMocks.getImportInstruction).toHaveBeenCalledWith(context, {
      locale: 'sv',
    })
  })

  it('rejects anonymous requests before loading the import instruction', async () => {
    routeMocks.createRequirementsRestRuntime.mockResolvedValue({
      context: makeContext(false),
      service: {
        getImportInstruction: routeMocks.getImportInstruction,
      },
    })

    const response = await GET(
      new Request('http://localhost/api/requirements/import/instruction'),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      code: 'unauthorized',
      error: 'Authentication is required',
    })
    expect(routeMocks.getImportInstruction).not.toHaveBeenCalled()
  })
})
