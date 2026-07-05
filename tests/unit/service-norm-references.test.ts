import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listNormReferences } from '@/lib/dal/norm-references'
import type { RequestContext } from '@/lib/requirements/auth'
import { createNormReferenceWorkflow } from '@/lib/requirements/service-norm-references'

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
    const workflow = createNormReferenceWorkflow({
      authorization,
      db: {} as never,
      logger: { error: vi.fn(), info: vi.fn() },
    })

    await expect(
      workflow.manageNormReference(makeContext(), {
        operation: 'search',
        search: '   ',
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Search text is required',
    })

    expect(authorization.assertAuthorized).toHaveBeenCalledWith(
      { kind: 'manage_norm_reference', operation: 'search' },
      expect.objectContaining({
        toolName: 'requirements_manage_norm_reference',
      }),
    )
    expect(listNormReferences).not.toHaveBeenCalled()
  })
})
