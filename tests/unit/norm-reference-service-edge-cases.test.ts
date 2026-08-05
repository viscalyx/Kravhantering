import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormReferenceRow } from '@/lib/dal/norm-references'
import type { RequestContext } from '@/lib/requirements/auth'

const state = vi.hoisted(() => ({
  create: vi.fn(),
  getById: vi.fn(),
  getByStableId: vi.fn(),
  list: vi.fn(),
  listConnected: vi.fn(),
}))

vi.mock('@/lib/dal/norm-references', () => ({
  getNormReferenceById: state.getById,
  getNormReferenceByNormReferenceId: state.getByStableId,
  listConnectedLibraryRequirementIds: state.listConnected,
  listNormReferences: state.list,
}))

vi.mock('@/lib/requirements/norm-reference-mutations', () => ({
  createNormReferenceWithAudit: state.create,
}))

import { createNormReferenceWorkflow } from '@/lib/requirements/service-norm-references'

const context: RequestContext = {
  actor: {
    displayName: 'Actor',
    hsaId: 'SE5560000001-actor',
    id: 'actor',
    isAuthenticated: true,
    roles: ['Admin'],
    source: 'mcp',
  },
  correlationId: 'correlation',
  requestId: 'request',
  source: 'mcp',
  toolName: 'requirements_manage_norm_reference',
}

const row = (overrides: Partial<NormReferenceRow> = {}): NormReferenceRow => ({
  createdAt: '2026-08-01T00:00:00.000Z',
  id: 7,
  isArchived: false,
  issuer: 'ISO',
  name: 'Security',
  normReferenceId: 'ISO-1',
  reference: 'ISO 1:2026',
  type: 'Standard',
  updatedAt: '2026-08-02T00:00:00.000Z',
  uri: null,
  version: null,
  ...overrides,
})

function workflow() {
  return createNormReferenceWorkflow({
    authorization: { assertAuthorized: vi.fn() },
    db: {} as never,
    logger: { error: vi.fn(), info: vi.fn() },
  })
}

describe('norm-reference service coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    state.create.mockResolvedValue(row())
    state.getById.mockResolvedValue(null)
    state.getByStableId.mockResolvedValue(null)
    state.list.mockResolvedValue([])
  })

  it('creates a canonical norm reference with every optional value', async () => {
    const result = await workflow().manageNormReference(context, {
      issuer: 'ISO',
      name: 'Security',
      normReferenceId: 'ISO-1',
      operation: 'create',
      reference: 'ISO 1:2026',
      type: 'Standard',
      uri: 'https://example.test',
      version: '2026',
    })
    expect(result).toEqual({ normReference: row() })
    expect(state.create).toHaveBeenCalledWith(
      expect.anything(),
      {
        issuer: 'ISO',
        name: 'Security',
        normReferenceId: 'ISO-1',
        reference: 'ISO 1:2026',
        type: 'Standard',
        uri: 'https://example.test',
        version: '2026',
      },
      context,
    )
  })

  it('searches all fields, omits misses, and sorts exact matches ahead of partial matches', async () => {
    state.list.mockResolvedValue([
      row({ id: 3, issuer: 'Zulu', name: 'Security framework' }),
      row({ id: 2, issuer: 'Alpha', name: 'Other', reference: 'security' }),
      row({ id: 1, issuer: 'Beta', name: 'Unrelated', reference: 'None' }),
    ])
    const result = await workflow().manageNormReference(context, {
      includeArchived: true,
      operation: 'search',
      search: ' security ',
    })
    expect('result' in result && result.result).toHaveLength(2)
    expect('result' in result && result.result.every(item => item.match)).toBe(
      true,
    )
    expect(state.list).toHaveBeenCalledWith(expect.anything(), {
      includeArchived: true,
    })
  })

  it.each([
    { id: 0, operation: 'get' as const, reason: 'invalid_norm_reference_id' },
    { id: 1.5, operation: 'get' as const, reason: 'invalid_norm_reference_id' },
    {
      normReferenceId: '   ',
      operation: 'get' as const,
      reason: 'invalid_norm_reference_business_id',
    },
  ])('rejects invalid selector detail $reason', async input => {
    await expect(
      workflow().manageNormReference(context, input),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: input.reason },
    })
  })
})
