import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listNormReferences } from '@/lib/dal/norm-references'
import type { RequestContext } from '@/lib/requirements/auth'
import { createNormReferenceWorkflow } from '@/lib/requirements/service-norm-references'
import { parseCapacityEvents } from '@/tests/helpers/capacity-events'

const mocks = vi.hoisted(() => ({
  createNormReferenceWithAudit: vi.fn(),
  listNormReferences: vi.fn(),
}))

vi.mock('@/lib/dal/norm-references', () => ({
  listNormReferences: mocks.listNormReferences,
}))

vi.mock('@/lib/requirements/norm-reference-mutations', () => ({
  createNormReferenceWithAudit: mocks.createNormReferenceWithAudit,
}))

function makeContext(): RequestContext {
  return {
    actor: {
      displayName: 'Norm Reference Actor',
      hsaId: 'SE5560000001-norm1',
      id: 'actor-norm-reference',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'mcp',
    },
    correlationId: 'corr-norm-reference',
    requestId: 'req-norm-reference',
    source: 'mcp',
    toolName: 'requirements_manage_norm_reference',
  }
}

describe('norm reference service workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listNormReferences).mockResolvedValue([])
  })

  it('rejects empty MCP norm-reference search text before matching rows', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const logger = { error: vi.fn(), info: vi.fn() }
    const consoleInfoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => undefined)
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const workflow = createNormReferenceWorkflow({
      authorization,
      db: {} as never,
      logger,
    })

    try {
      await expect(
        workflow.manageNormReference(makeContext(), {
          operation: 'search',
          search: '   ',
        }),
      ).rejects.toMatchObject({
        code: 'validation',
        message: 'Search text is required',
        status: 400,
      })

      expect(authorization.assertAuthorized).toHaveBeenCalledWith(
        { kind: 'manage_norm_reference', operation: 'search' },
        expect.objectContaining({
          toolName: 'requirements_manage_norm_reference',
        }),
      )
      expect(listNormReferences).not.toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(
        'requirements.manage_norm_reference.failed',
        expect.objectContaining({
          error: 'Search text is required',
          operation: 'search',
          status_code: 400,
        }),
      )
      expect(parseCapacityEvents(consoleErrorSpy)).toEqual([])
      expect(parseCapacityEvents(consoleInfoSpy)[0]).toMatchObject({
        event: 'capacity.operation.failed',
        level: 'warn',
        operation: 'requirements.manage_norm_reference',
        outcome: 'failure',
        status_code: 400,
        tool_name: 'requirements_manage_norm_reference',
      })
    } finally {
      consoleInfoSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    }
  })
})
