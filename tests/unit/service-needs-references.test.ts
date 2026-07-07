import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSpecificationNeedsReference,
  listSpecificationNeedsReferences,
  type SpecificationNeedsReferenceSummary,
} from '@/lib/dal/requirements-specifications'
import type { RequestContext } from '@/lib/requirements/auth'
import { createNeedsReferenceWorkflow } from '@/lib/requirements/service-needs-references'

const mocks = vi.hoisted(() => ({
  createSpecificationNeedsReference: vi.fn(),
  listSpecificationNeedsReferences: vi.fn(),
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  createSpecificationNeedsReference: mocks.createSpecificationNeedsReference,
  listSpecificationNeedsReferences: mocks.listSpecificationNeedsReferences,
}))

function makeContext(): RequestContext {
  return {
    actor: {
      displayName: 'Needs Reference Actor',
      hsaId: 'SE5560000001-needs1',
      id: 'actor-needs-reference',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'mcp',
    },
    correlationId: 'corr-needs-reference',
    requestId: 'req-needs-reference',
    source: 'mcp',
    toolName: 'requirements_manage_needs_reference',
  }
}

function needsReferenceRow(
  overrides: Partial<SpecificationNeedsReferenceSummary> = {},
): SpecificationNeedsReferenceSummary {
  return {
    createdAt: '2026-07-05T10:00:00.000Z',
    description: 'Stödjer införande av GDPR artikel 32.',
    id: 12,
    libraryItemCount: 1,
    linkedItemCount: 2,
    specificationLocalRequirementCount: 1,
    text: 'Personuppgiftsbehandling behöver tekniskt skydd',
    updatedAt: '2026-07-05T10:00:00.000Z',
    ...overrides,
  }
}

describe('needs reference service workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listSpecificationNeedsReferences).mockResolvedValue([])
  })

  it('lists specification-scoped needs references sorted by text', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const logger = { error: vi.fn(), info: vi.fn() }
    const rows = [
      needsReferenceRow({ id: 2, text: 'Zeta behov' }),
      needsReferenceRow({ id: 1, text: 'Alfa behov' }),
    ]
    vi.mocked(listSpecificationNeedsReferences).mockResolvedValue(rows)
    const workflow = createNeedsReferenceWorkflow({
      authorization,
      db: {} as never,
      logger,
    })

    const result = await workflow.manageNeedsReference(makeContext(), {
      operation: 'list',
      specificationId: 8,
    })

    expect(result).toMatchObject({
      result: [
        { id: 1, text: 'Alfa behov' },
        { id: 2, text: 'Zeta behov' },
      ],
    })
    expect(listSpecificationNeedsReferences).toHaveBeenCalledWith(
      expect.anything(),
      8,
    )
    expect(authorization.assertAuthorized).toHaveBeenCalledWith(
      {
        kind: 'manage_specification_needs_reference',
        operation: 'list',
        specificationId: 8,
      },
      expect.objectContaining({
        toolName: 'requirements_manage_needs_reference',
      }),
    )
  })

  it('searches needs references by text and description with match metadata', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const logger = { error: vi.fn(), info: vi.fn() }
    vi.mocked(listSpecificationNeedsReferences).mockResolvedValue([
      needsReferenceRow({ description: null, id: 2, text: 'Arkivering' }),
      needsReferenceRow({
        id: 1,
        description: 'Stödjer GDPR artikel 32.',
        text: 'Personuppgiftsbehandling',
      }),
    ])
    const workflow = createNeedsReferenceWorkflow({
      authorization,
      db: {} as never,
      logger,
    })

    const result = await workflow.manageNeedsReference(makeContext(), {
      operation: 'search',
      search: 'gdpr',
      specificationId: 8,
    })

    expect(result).toEqual({
      result: [
        expect.objectContaining({
          id: 1,
          match: expect.objectContaining({
            matchedFields: ['description'],
          }),
        }),
      ],
    })
  })

  it('gets one needs reference inside the selected specification', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const logger = { error: vi.fn(), info: vi.fn() }
    const row = needsReferenceRow({ id: 12 })
    vi.mocked(listSpecificationNeedsReferences).mockResolvedValue([row])
    const workflow = createNeedsReferenceWorkflow({
      authorization,
      db: {} as never,
      logger,
    })

    const result = await workflow.manageNeedsReference(makeContext(), {
      needsReferenceId: 12,
      operation: 'get',
      specificationId: 8,
    })

    expect(result).toEqual({ needsReference: row })
  })

  it('creates a needs reference in one specification', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const logger = { error: vi.fn(), info: vi.fn() }
    const db = {} as never
    const row = needsReferenceRow({ id: 14, text: 'IAM-42' })
    vi.mocked(createSpecificationNeedsReference).mockResolvedValue(row)
    const workflow = createNeedsReferenceWorkflow({
      authorization,
      db,
      logger,
    })

    const result = await workflow.manageNeedsReference(makeContext(), {
      description: 'Access management work',
      operation: 'create',
      specificationId: 8,
      text: 'IAM-42',
    })

    expect(result).toEqual({ needsReference: row })
    expect(createSpecificationNeedsReference).toHaveBeenCalledWith(db, 8, {
      description: 'Access management work',
      text: 'IAM-42',
    })
  })

  it('rejects empty search text before listing rows', async () => {
    const authorization = { assertAuthorized: vi.fn() }
    const logger = { error: vi.fn(), info: vi.fn() }
    const workflow = createNeedsReferenceWorkflow({
      authorization,
      db: {} as never,
      logger,
    })

    await expect(
      workflow.manageNeedsReference(makeContext(), {
        operation: 'search',
        search: '   ',
        specificationId: 8,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Search text is required',
    })

    expect(listSpecificationNeedsReferences).not.toHaveBeenCalled()
  })
})
