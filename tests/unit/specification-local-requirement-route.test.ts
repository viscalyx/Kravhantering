import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {}

const mocks = {
  deleteSpecificationLocalRequirement: vi.fn(),
  getPackageById: vi.fn(),
  getPackageBySlug: vi.fn(),
}

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: () => mockDb,
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  deleteSpecificationLocalRequirement: (...args: unknown[]) =>
    mocks.deleteSpecificationLocalRequirement(...args),
  getPackageById: (...args: unknown[]) => mocks.getPackageById(...args),
  getPackageBySlug: (...args: unknown[]) => mocks.getPackageBySlug(...args),
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
    mocks.getPackageBySlug.mockResolvedValue({ id: 5 })
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
          'http://localhost/api/specifications/pkg/local-requirements/41',
        ),
        makeParams('pkg', '41'),
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
})
