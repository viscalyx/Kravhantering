import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  countDeviationsBySpecification: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  getSpecificationById: vi.fn(),
  listDeviationsForSpecification: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))
vi.mock('@/lib/dal/requirements-specifications', () => ({
  getSpecificationById: routeState.getSpecificationById,
}))
vi.mock('@/lib/dal/deviations', () => ({
  countDeviationsBySpecification: routeState.countDeviationsBySpecification,
  listDeviationsForSpecification: routeState.listDeviationsForSpecification,
}))

import { GET } from '@/app/api/requirements-specifications/[id]/deviations/route'

const request = new Request(
  'https://example.test/api/requirements-specifications/7/deviations',
)
const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe('requirements specification deviations route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.getRequestSqlServerDataSource.mockResolvedValue({ db: true })
  })

  it('rejects an invalid specification identifier before database work', async () => {
    const response = await GET(request as never, params('invalid'))

    expect(response.status).toBe(400)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })

  it('returns not found when the specification does not exist', async () => {
    routeState.getSpecificationById.mockResolvedValue(null)

    const response = await GET(request as never, params('7'))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
    expect(routeState.listDeviationsForSpecification).not.toHaveBeenCalled()
  })

  it('returns deviation rows and counts for the resolved specification', async () => {
    routeState.getSpecificationById.mockResolvedValue({ id: 11 })
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
      11,
    )
    expect(routeState.countDeviationsBySpecification).toHaveBeenCalledWith(
      { db: true },
      11,
    )
  })
})
