import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDataSource: vi.fn(),
  handleRequest: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mocks.getDataSource,
}))

vi.mock('@/lib/mcp/http', () => ({
  handleRequirementsMcpRequest: mocks.handleRequest,
}))

import { DELETE, GET, POST } from '@/app/api/mcp/route'

describe('MCP route adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['GET', GET],
    ['POST', POST],
    ['DELETE', DELETE],
  ] as const)(
    'delegates %s with the request-scoped database',
    async (_, route) => {
      const database = { kind: 'sql-server' }
      const expected = new Response(null, { status: 204 })
      const request = new Request('https://example.test/api/mcp')
      mocks.getDataSource.mockResolvedValue(database)
      mocks.handleRequest.mockResolvedValue(expected)

      await expect(route(request)).resolves.toBe(expected)
      expect(mocks.handleRequest).toHaveBeenCalledWith(request, database)
    },
  )
})
