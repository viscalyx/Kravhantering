import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SPECIFICATION_ITEM_SELECTION_ACTION_LIMIT } from '@/lib/specifications/selection-action-limit'

const routeState = vi.hoisted(() => ({
  authorize: vi.fn(),
  createRequirementsRestRuntime: vi.fn(),
  getSpecificationById: vi.fn(),
  listSpecificationTraceabilityItems: vi.fn(),
}))

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: routeState.createRequirementsRestRuntime,
}))

vi.mock('@/lib/requirements/service-shared', () => ({
  authorize: routeState.authorize,
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  getSpecificationById: routeState.getSpecificationById,
  listSpecificationTraceabilityItems:
    routeState.listSpecificationTraceabilityItems,
}))

describe('specification item resolution route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.createRequirementsRestRuntime.mockResolvedValue({
      authorization: {},
      context: { actor: { isAuthenticated: true }, source: 'rest' },
      db: {},
    })
    routeState.getSpecificationById.mockResolvedValue({ id: 42 })
    routeState.authorize.mockResolvedValue(undefined)
    routeState.listSpecificationTraceabilityItems.mockResolvedValue([
      {
        itemRef: 'lib:31',
        kind: 'library',
        needsReference: 'IAM-42',
        needsReferenceId: 77,
        uniqueId: 'BEH0001',
      },
    ])
  })

  it('returns the bounded authoritative subset in requested reference order', async () => {
    const { GET } = await import(
      '@/app/api/specification-item-resolutions/[id]/route'
    )
    const response = await GET(
      new NextRequest(
        'http://localhost/api/specification-item-resolutions/42?refs=lib%3A31&refs=local%3A41',
      ),
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      items: [
        {
          itemRef: 'lib:31',
          kind: 'library',
          needsReference: 'IAM-42',
          needsReferenceId: 77,
          uniqueId: 'BEH0001',
        },
      ],
    })
    expect(routeState.authorize).toHaveBeenCalledWith(
      expect.anything(),
      { kind: 'get_specification_items', specificationId: 42 },
      expect.anything(),
    )
    expect(routeState.listSpecificationTraceabilityItems).toHaveBeenCalledWith(
      {},
      42,
      ['lib:31', 'local:41'],
    )
  })

  it('rejects duplicate or malformed stable references before database work', async () => {
    const { GET } = await import(
      '@/app/api/specification-item-resolutions/[id]/route'
    )
    const response = await GET(
      new NextRequest(
        'http://localhost/api/specification-item-resolutions/42?refs=lib%3A31&refs=lib%3A31',
      ),
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(400)
    expect(routeState.createRequirementsRestRuntime).not.toHaveBeenCalled()
  })

  it('rejects an invalid specification identifier before runtime work', async () => {
    const { GET } = await import(
      '@/app/api/specification-item-resolutions/[id]/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/specification-item-resolutions/invalid?refs=lib%3A31',
      ),
      { params: Promise.resolve({ id: 'invalid' }) },
    )

    expect(response.status).toBe(400)
    expect(routeState.createRequirementsRestRuntime).not.toHaveBeenCalled()
  })

  it('returns not found before authorization when the specification is missing', async () => {
    routeState.getSpecificationById.mockResolvedValueOnce(null)
    const { GET } = await import(
      '@/app/api/specification-item-resolutions/[id]/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/specification-item-resolutions/404?refs=lib%3A31',
      ),
      { params: Promise.resolve({ id: '404' }) },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
    expect(routeState.authorize).not.toHaveBeenCalled()
  })

  it('maps authorization failures to the public error contract', async () => {
    routeState.authorize.mockRejectedValueOnce(new Error('authorization down'))
    const { GET } = await import(
      '@/app/api/specification-item-resolutions/[id]/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/specification-item-resolutions/42?refs=lib%3A31',
      ),
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain(
      'authorization down',
    )
    expect(routeState.listSpecificationTraceabilityItems).not.toHaveBeenCalled()
  })

  it('rejects direct resolution requests above the selected-item action limit', async () => {
    const refs = Array.from(
      { length: SPECIFICATION_ITEM_SELECTION_ACTION_LIMIT + 1 },
      (_, index) => `lib:${index + 1}`,
    )
    const params = new URLSearchParams()
    for (const ref of refs) params.append('refs', ref)
    const { GET } = await import(
      '@/app/api/specification-item-resolutions/[id]/route'
    )

    const response = await GET(
      new NextRequest(
        `http://localhost/api/specification-item-resolutions/42?${params}`,
      ),
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(400)
    expect(routeState.createRequirementsRestRuntime).not.toHaveBeenCalled()
  })
})
