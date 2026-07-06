import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getNormReferenceById,
  getNormReferenceByNormReferenceId,
  listConnectedLibraryRequirementIds,
  listNormReferences,
  type NormReferenceRow,
} from '@/lib/dal/norm-references'
import type { RequestContext } from '@/lib/requirements/auth'
import { createNormReferenceWorkflow } from '@/lib/requirements/service-norm-references'
import { parseCapacityEvents } from '@/tests/helpers/capacity-events'

const mocks = vi.hoisted(() => ({
  createNormReferenceWithAudit: vi.fn(),
  getNormReferenceById: vi.fn(),
  getNormReferenceByNormReferenceId: vi.fn(),
  listConnectedLibraryRequirementIds: vi.fn(),
  listNormReferences: vi.fn(),
}))

vi.mock('@/lib/dal/norm-references', () => ({
  getNormReferenceById: mocks.getNormReferenceById,
  getNormReferenceByNormReferenceId: mocks.getNormReferenceByNormReferenceId,
  listConnectedLibraryRequirementIds: mocks.listConnectedLibraryRequirementIds,
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

function normReferenceRow(
  overrides: Partial<NormReferenceRow> = {},
): NormReferenceRow {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 7,
    isArchived: false,
    issuer: 'ISO',
    name: 'ISO 27001',
    normReferenceId: 'ISO-27001',
    reference: 'ISO/IEC 27001:2022',
    type: 'Standard',
    updatedAt: '2026-01-02T00:00:00.000Z',
    uri: 'https://example.test/iso-27001',
    version: '2022',
    ...overrides,
  }
}

describe('norm reference service workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getNormReferenceById).mockResolvedValue(null)
    vi.mocked(getNormReferenceByNormReferenceId).mockResolvedValue(null)
    vi.mocked(listConnectedLibraryRequirementIds).mockResolvedValue([])
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

  it('returns canonical list rows without connected requirement usage metadata', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const logger = { error: vi.fn(), info: vi.fn() }
    const rowWithUsage = {
      ...normReferenceRow(),
      linkedRequirementCount: 2,
      linkedRequirements: [{ id: 12, uniqueId: 'REQ-0012' }],
      requirements: [{ id: 12, uniqueId: 'REQ-0012' }],
    } as NormReferenceRow & Record<string, unknown>
    vi.mocked(listNormReferences).mockResolvedValue([rowWithUsage])
    const workflow = createNormReferenceWorkflow({
      authorization,
      db: {} as never,
      logger,
    })

    const result = await workflow.manageNormReference(makeContext(), {
      includeArchived: true,
      operation: 'list',
    })

    expect(result).toEqual({
      result: [normReferenceRow()],
    })
    const [row] = 'result' in result ? result.result : []
    expect(row).not.toHaveProperty('linkedRequirementCount')
    expect(row).not.toHaveProperty('linkedRequirements')
    expect(row).not.toHaveProperty('requirements')
    expect(listNormReferences).toHaveBeenCalledWith(expect.anything(), {
      includeArchived: true,
    })
  })

  it('gets an exact archived norm reference by stable normReferenceId', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const logger = { error: vi.fn(), info: vi.fn() }
    const db = {} as never
    const row = normReferenceRow({
      id: 12,
      isArchived: true,
      normReferenceId: 'AFS-2023-1',
    })
    vi.mocked(getNormReferenceByNormReferenceId).mockResolvedValue(row)
    const workflow = createNormReferenceWorkflow({
      authorization,
      db,
      logger,
    })

    const result = await workflow.manageNormReference(makeContext(), {
      normReferenceId: '  AFS-2023-1  ',
      operation: 'get',
    })

    expect(result).toEqual({ normReference: row })
    expect(getNormReferenceByNormReferenceId).toHaveBeenCalledWith(
      db,
      'AFS-2023-1',
    )
    expect(authorization.assertAuthorized).toHaveBeenCalledWith(
      { kind: 'manage_norm_reference', operation: 'get' },
      expect.objectContaining({
        toolName: 'requirements_manage_norm_reference',
      }),
    )
  })

  it('lists connected library requirement IDs through a resolved norm reference', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const logger = { error: vi.fn(), info: vi.fn() }
    const db = {} as never
    vi.mocked(getNormReferenceById).mockResolvedValue(
      normReferenceRow({ id: 12 }),
    )
    vi.mocked(listConnectedLibraryRequirementIds).mockResolvedValue([
      { id: 5, uniqueId: 'REQ-0005' },
      { id: 9, uniqueId: 'REQ-0009' },
    ])
    const workflow = createNormReferenceWorkflow({
      authorization,
      db,
      logger,
    })

    const result = await workflow.manageNormReference(makeContext(), {
      id: 12,
      operation: 'list_connected_requirement_ids',
    })

    expect(result).toEqual({
      requirements: [
        { id: 5, uniqueId: 'REQ-0005' },
        { id: 9, uniqueId: 'REQ-0009' },
      ],
    })
    expect(listConnectedLibraryRequirementIds).toHaveBeenCalledWith(db, 12)
    expect(authorization.assertAuthorized).toHaveBeenCalledWith(
      {
        kind: 'manage_norm_reference',
        operation: 'list_connected_requirement_ids',
      },
      expect.objectContaining({
        toolName: 'requirements_manage_norm_reference',
      }),
    )
  })

  it.each([
    { operation: 'get' as const },
    { id: 7, normReferenceId: 'ISO-27001', operation: 'get' as const },
    { operation: 'list_connected_requirement_ids' as const },
    {
      id: 7,
      normReferenceId: 'ISO-27001',
      operation: 'list_connected_requirement_ids' as const,
    },
  ])('rejects invalid norm-reference selectors for %s', async input => {
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
        workflow.manageNormReference(makeContext(), input),
      ).rejects.toMatchObject({
        code: 'validation',
        message: 'Provide exactly one of id or normReferenceId',
        status: 400,
      })

      expect(getNormReferenceById).not.toHaveBeenCalled()
      expect(getNormReferenceByNormReferenceId).not.toHaveBeenCalled()
      expect(listConnectedLibraryRequirementIds).not.toHaveBeenCalled()
      expect(parseCapacityEvents(consoleErrorSpy)).toEqual([])
      expect(parseCapacityEvents(consoleInfoSpy)[0]).toMatchObject({
        event: 'capacity.operation.failed',
        operation: 'requirements.manage_norm_reference',
        outcome: 'failure',
        status_code: 400,
      })
    } finally {
      consoleInfoSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    }
  })

  it('returns not found when an exact norm reference selector has no match', async () => {
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
          id: 99,
          operation: 'get',
        }),
      ).rejects.toMatchObject({
        code: 'not_found',
        message: 'Norm reference not found',
        status: 404,
      })

      expect(getNormReferenceById).toHaveBeenCalledWith(expect.anything(), 99)
      expect(listConnectedLibraryRequirementIds).not.toHaveBeenCalled()
    } finally {
      consoleInfoSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    }
  })
})
