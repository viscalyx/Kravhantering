import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMcpAuthConfig: vi.fn(),
  getDataSource: vi.fn(),
  handleRequest: vi.fn(),
}))

vi.mock('@/lib/auth/config', () => ({
  getMcpAuthConfig: mocks.getMcpAuthConfig,
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mocks.getDataSource,
}))

vi.mock('@/lib/mcp/http', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/mcp/http')>()),
  handleRequirementsMcpRequest: mocks.handleRequest,
}))

import { DELETE, GET, POST } from '@/app/api/mcp/route'

describe('MCP route adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMcpAuthConfig.mockReturnValue({
      clientId: 'kravhantering-mcp',
      requiredScopes: ['kravhantering:mcp'],
      rolesClaim: 'roles',
      tokenMaxAgeSeconds: 300,
    })
  })

  it.each([
    ['GET', GET],
    ['POST', POST],
    ['DELETE', DELETE],
  ] as const)(
    'returns 404 for disabled MCP before %s request work',
    async (_, route) => {
      mocks.getMcpAuthConfig.mockReturnValue(null)
      const request = new Request('https://example.test/api/mcp')

      const response = await route(request)

      expect(response.status).toBe(404)
      expect(await response.text()).toBe('')
      expect(mocks.getDataSource).not.toHaveBeenCalled()
      expect(mocks.handleRequest).not.toHaveBeenCalled()
    },
  )

  it('returns the stable configuration error before database work', async () => {
    mocks.getMcpAuthConfig.mockImplementation(() => {
      throw new Error('AUTH_MCP_REQUIRED_SCOPES contains private detail')
    })

    const response = await GET(
      new Request('https://example.test/api/mcp', {
        headers: { authorization: 'Bearer secret.token.value' },
      }),
    )
    const body = await response.text()

    expect(response.status).toBe(500)
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer')
    expect(JSON.parse(body)).toEqual({
      error: { code: -32000, message: 'Authentication failed.' },
      id: null,
      jsonrpc: '2.0',
    })
    expect(body).not.toMatch(/AUTH_MCP|required|private|secret|token\.value/i)
    expect(mocks.getDataSource).not.toHaveBeenCalled()
    expect(mocks.handleRequest).not.toHaveBeenCalled()
  })

  it.each([
    ['GET', GET],
    ['POST', POST],
    ['DELETE', DELETE],
  ] as const)(
    'delegates %s with lazy request-scoped database acquisition',
    async (_, route) => {
      const database = { kind: 'sql-server' }
      const expected = new Response(null, { status: 204 })
      const request = new Request('https://example.test/api/mcp')
      mocks.getDataSource.mockResolvedValue(database)
      mocks.handleRequest.mockResolvedValue(expected)

      await expect(route(request)).resolves.toBe(expected)
      expect(mocks.getDataSource).not.toHaveBeenCalled()
      expect(mocks.handleRequest).toHaveBeenCalledWith(
        request,
        expect.any(Function),
      )
      const getDatabase = mocks.handleRequest.mock.calls[0]?.[1]
      await expect(getDatabase()).resolves.toBe(database)
    },
  )
})
