import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {}

const mocks = {
  deleteSpecificationLocalRequirement: vi.fn(),
  getSpecificationById: vi.fn(),
  getSpecificationBySlug: vi.fn(),
}

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: () => mockDb,
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  deleteSpecificationLocalRequirement: (...args: unknown[]) =>
    mocks.deleteSpecificationLocalRequirement(...args),
  getSpecificationById: (...args: unknown[]) =>
    mocks.getSpecificationById(...args),
  getSpecificationBySlug: (...args: unknown[]) =>
    mocks.getSpecificationBySlug(...args),
  getSpecificationLocalRequirementDetail: vi.fn(),
  updateSpecificationLocalRequirement: vi.fn(),
}))

import { DELETE } from '@/app/api/specifications/[id]/local-requirements/[localRequirementId]/route'

function makeParams(id: string, localRequirementId: string) {
  return { params: Promise.resolve({ id, localRequirementId }) }
}

describe('specifications/[id]/local-requirements/[localRequirementId] route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSpecificationBySlug.mockResolvedValue({ id: 5 })
  })

  it('returns a JSON 500 when deleting a specification-local requirement fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.deleteSpecificationLocalRequirement.mockRejectedValue(
      new Error('delete failed'),
    )

    try {
      const response = await DELETE(
        new NextRequest(
          'http://localhost/api/specifications/spec/local-requirements/41',
        ),
        makeParams('spec', '41'),
      )

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to delete specification-local requirement',
      })
      expect(mocks.deleteSpecificationLocalRequirement).toHaveBeenCalledWith(
        mockDb,
        5,
        41,
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to delete specification-local requirement',
        expect.any(Error),
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('returns 400 when localRequirementId is not a positive integer', async () => {
    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/specifications/spec/local-requirements/abc',
      ),
      makeParams('spec', 'abc'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid localRequirementId',
    })
    expect(mocks.deleteSpecificationLocalRequirement).not.toHaveBeenCalled()
  })

  it('returns 404 when the specification slug does not resolve', async () => {
    mocks.getSpecificationBySlug.mockResolvedValueOnce(null)

    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/specifications/missing/local-requirements/41',
      ),
      makeParams('missing', '41'),
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
    expect(mocks.deleteSpecificationLocalRequirement).not.toHaveBeenCalled()
  })

  it('returns 404 when the requirement was not deleted', async () => {
    mocks.deleteSpecificationLocalRequirement.mockResolvedValueOnce(false)

    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/specifications/spec/local-requirements/41',
      ),
      makeParams('spec', '41'),
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
    expect(mocks.deleteSpecificationLocalRequirement).toHaveBeenCalledWith(
      mockDb,
      5,
      41,
    )
  })

  it('returns 200 when the requirement was deleted', async () => {
    mocks.deleteSpecificationLocalRequirement.mockResolvedValueOnce(true)

    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/specifications/spec/local-requirements/41',
      ),
      makeParams('spec', '41'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.deleteSpecificationLocalRequirement).toHaveBeenCalledWith(
      mockDb,
      5,
      41,
    )
  })
})
