import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  generateChatStream: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  loadTaxonomy: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/ai/taxonomy', () => ({
  loadTaxonomy: routeState.loadTaxonomy,
}))

vi.mock('@/lib/ai/requirement-prompt', () => ({
  REQUIREMENT_FORMAT_SCHEMA: { type: 'object' },
  buildSystemPrompt: () => 'system prompt',
  buildUserPrompt: () => 'user prompt',
  validateGeneratedRequirements: (requirements: unknown[]) => requirements,
}))

vi.mock('@/lib/ai/openrouter-client', () => ({
  generateChatStream: routeState.generateChatStream,
}))

import { POST } from '@/app/api/ai/generate-requirements/route'

function makeRequest(): Request {
  return new Request('https://example.test/api/ai/generate-requirements', {
    body: JSON.stringify({
      locale: 'en',
      topic: 'secure audit logging',
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
}

describe('POST /api/ai/generate-requirements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.getRequestSqlServerDataSource.mockResolvedValue({})
    routeState.loadTaxonomy.mockResolvedValue({})
  })

  it('streams sanitized provider errors only', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    routeState.generateChatStream.mockImplementation(async function* () {
      yield {
        cause:
          'OpenRouter error (500): SELECT token FROM sessions; Authorization: Bearer eyJhbGci.demo.payload; sk-or-v1-secret',
        message: 'AI provider is unavailable',
        phase: 'error',
      }
    })

    try {
      const response = await POST(makeRequest())
      const text = await response.text()

      expect(response.headers.get('Content-Type')).toContain(
        'text/event-stream',
      )
      expect(text).toContain('event: error')
      expect(text).toContain('"message":"AI provider is unavailable"')
      expect(text).not.toMatch(/OpenRouter error|SELECT|Bearer|sk-or-v1/)
      expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toMatch(
        /SELECT token|eyJhbGci|sk-or-v1-secret/,
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('sanitizes thrown stream failures', async () => {
    routeState.generateChatStream.mockImplementation(async function* () {
      yield* []
      throw new Error('network failed with sk-or-v1-secret')
    })

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    try {
      const response = await POST(makeRequest())
      const text = await response.text()

      expect(text).toContain('"message":"AI provider is unavailable"')
      expect(text).not.toContain('sk-or-v1-secret')
      expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(
        'sk-or-v1-secret',
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })
})
