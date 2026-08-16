import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forbiddenError, notFoundError } from '@/lib/requirements/errors'

const routeState = vi.hoisted(() => ({
  authorization: { assertAuthorized: vi.fn() },
  authorize: vi.fn(),
  countDeviationsBySpecification: vi.fn(),
  context: { requestId: 'request-1' },
  createRequirementsRestRuntime: vi.fn(),
  listDeviationsForSpecification: vi.fn(),
}))

vi.mock('@/lib/dal/deviations', () => ({
  countDeviationsBySpecification: routeState.countDeviationsBySpecification,
  listDeviationsForSpecification: routeState.listDeviationsForSpecification,
}))
vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: routeState.createRequirementsRestRuntime,
}))
vi.mock('@/lib/requirements/service-shared', () => ({
  authorize: routeState.authorize,
}))

import { GET } from '@/app/api/requirements-specifications/[id]/deviations/route'

const request = new Request(
  'https://example.test/api/requirements-specifications/7/deviations',
)
const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe('requirements specification deviations route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.createRequirementsRestRuntime.mockResolvedValue({
      authorization: routeState.authorization,
      context: routeState.context,
      db: { db: true },
    })
  })

  it('rejects an invalid specification identifier before database work', async () => {
    const response = await GET(request as never, params('invalid'))

    expect(response.status).toBe(400)
    expect(routeState.createRequirementsRestRuntime).not.toHaveBeenCalled()
  })

  it('returns not found when the specification does not exist', async () => {
    routeState.authorize.mockRejectedValueOnce(notFoundError('Not found'))

    const response = await GET(request as never, params('7'))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      code: 'not_found',
      error: 'Not found',
    })
    expect(routeState.listDeviationsForSpecification).not.toHaveBeenCalled()
  })

  it('returns deviation rows and counts for the resolved specification', async () => {
    routeState.listDeviationsForSpecification.mockResolvedValue([
      { id: 2, motivation: 'Documented exception' },
    ])
    routeState.countDeviationsBySpecification.mockResolvedValue({ total: 1 })

    const response = await GET(request as never, params('7'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      counts: { total: 1 },
      deviations: [{ id: 2, motivation: 'Documented exception' }],
    })
    expect(routeState.listDeviationsForSpecification).toHaveBeenCalledWith(
      { db: true },
      7,
    )
    expect(routeState.countDeviationsBySpecification).toHaveBeenCalledWith(
      { db: true },
      7,
    )
    expect(routeState.authorize).toHaveBeenCalledWith(
      routeState.authorization,
      {
        childKind: 'deviation_collection',
        kind: 'get_specification_child',
        specificationId: 7,
      },
      routeState.context,
    )
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('denies a foreign specification before deviation payloads are read', async () => {
    routeState.authorize.mockRejectedValueOnce(
      forbiddenError('Specification read denied'),
    )

    const response = await GET(request as never, params('7'))

    expect(response.status).toBe(403)
    expect(routeState.listDeviationsForSpecification).not.toHaveBeenCalled()
    expect(routeState.countDeviationsBySpecification).not.toHaveBeenCalled()
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('rethrows unexpected authorization failures before reading deviations', async () => {
    routeState.authorize.mockRejectedValueOnce(new Error('database offline'))

    await expect(GET(request as never, params('7'))).rejects.toThrow(
      'database offline',
    )
    expect(routeState.listDeviationsForSpecification).not.toHaveBeenCalled()
    expect(routeState.countDeviationsBySpecification).not.toHaveBeenCalled()
  })
})
