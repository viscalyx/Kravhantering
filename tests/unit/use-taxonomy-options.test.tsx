import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

function failedResponse() {
  return { ok: false, json: async () => ({}) }
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { useTaxonomyOptions } from '@/hooks/useTaxonomyOptions'

const sampleAreas = [{ id: 1, name: 'Area 1', ownerName: 'Owner' }]
const sampleCategories = [{ id: 1, nameSv: 'Kat', nameEn: 'Cat' }]
const sampleTypes = [{ id: 1, nameSv: 'Typ', nameEn: 'Type' }]
const samplePackages = [{ id: 1, nameSv: 'Paket', nameEn: 'Package' }]
const sampleNormRefs = [{ id: 1, name: 'NR-1', normReferenceId: 'NR001' }]
const sampleRiskLevels = [{ id: 1, nameSv: 'Låg', nameEn: 'Low' }]
const sampleQC = [
  { id: 10, nameSv: 'Qc sv', nameEn: 'Qc en', parentId: null },
  { id: 11, nameSv: 'Child sv', nameEn: 'Child en', parentId: 10 },
]

function setupFetchMock() {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/api/requirement-areas'))
      return Promise.resolve(okJson({ areas: sampleAreas }))
    if (url.includes('/api/requirement-categories'))
      return Promise.resolve(okJson({ categories: sampleCategories }))
    if (url.includes('/api/requirement-types'))
      return Promise.resolve(okJson({ types: sampleTypes }))
    if (url.includes('/api/requirement-packages'))
      return Promise.resolve(okJson({ requirementPackages: samplePackages }))
    if (url.includes('/api/norm-references'))
      return Promise.resolve(okJson({ normReferences: sampleNormRefs }))
    if (url.includes('/api/risk-levels'))
      return Promise.resolve(okJson({ riskLevels: sampleRiskLevels }))
    if (url.includes('/api/quality-characteristics'))
      return Promise.resolve(okJson({ qualityCharacteristics: sampleQC }))
    return Promise.resolve(okJson({}))
  })
}

describe('useTaxonomyOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches all 6 taxonomy endpoints on mount', async () => {
    setupFetchMock()

    const { result } = renderHook(() => useTaxonomyOptions(''))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/requirement-areas')
    expect(fetchMock).toHaveBeenCalledWith('/api/requirement-categories')
    expect(fetchMock).toHaveBeenCalledWith('/api/requirement-types')
    expect(fetchMock).toHaveBeenCalledWith('/api/requirement-packages')
    expect(fetchMock).toHaveBeenCalledWith('/api/norm-references')
    expect(fetchMock).toHaveBeenCalledWith('/api/risk-levels')
  })

  it('returns populated option arrays after mount', async () => {
    setupFetchMock()

    const { result } = renderHook(() => useTaxonomyOptions(''))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.areas).toEqual(sampleAreas)
    expect(result.current.categories).toEqual(sampleCategories)
    expect(result.current.types).toEqual(sampleTypes)
    expect(result.current.requirementPackages).toEqual(samplePackages)
    expect(result.current.normReferences).toEqual(sampleNormRefs)
    expect(result.current.riskLevels).toEqual(sampleRiskLevels)
  })

  it('fetches quality characteristics when typeId is provided', async () => {
    setupFetchMock()

    const { result } = renderHook(() => useTaxonomyOptions('1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/quality-characteristics?typeId=1',
    )
    expect(result.current.qualityCharacteristics).toEqual(sampleQC)
  })

  it('clears quality characteristics when typeId is empty', async () => {
    setupFetchMock()

    const { result, rerender } = renderHook(
      ({ typeId }: { typeId: string }) => useTaxonomyOptions(typeId),
      { initialProps: { typeId: '1' } },
    )

    await waitFor(() => {
      expect(result.current.qualityCharacteristics).toEqual(sampleQC)
    })

    await act(async () => {
      rerender({ typeId: '' })
    })

    await waitFor(() => {
      expect(result.current.qualityCharacteristics).toEqual([])
    })
  })

  it('fetches new quality characteristics when typeId changes', async () => {
    setupFetchMock()

    const { result, rerender } = renderHook(
      ({ typeId }: { typeId: string }) => useTaxonomyOptions(typeId),
      { initialProps: { typeId: '1' } },
    )

    await waitFor(() => {
      expect(result.current.qualityCharacteristics).toEqual(sampleQC)
    })

    fetchMock.mockClear()
    setupFetchMock()

    await act(async () => {
      rerender({ typeId: '2' })
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/quality-characteristics?typeId=2',
      )
    })
  })

  it('handles partial fetch failures gracefully', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/requirement-areas'))
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url.includes('/api/requirement-categories'))
        return Promise.reject(new Error('Network error'))
      if (url.includes('/api/requirement-types'))
        return Promise.resolve(failedResponse())
      if (url.includes('/api/requirement-packages'))
        return Promise.resolve(okJson({ requirementPackages: samplePackages }))
      if (url.includes('/api/norm-references'))
        return Promise.resolve(okJson({ normReferences: sampleNormRefs }))
      if (url.includes('/api/risk-levels'))
        return Promise.resolve(okJson({ riskLevels: sampleRiskLevels }))
      return Promise.resolve(okJson({}))
    })

    const { result } = renderHook(() => useTaxonomyOptions(''))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Areas succeeded
    expect(result.current.areas).toEqual(sampleAreas)
    // Categories failed — should remain empty
    expect(result.current.categories).toEqual([])
    // Types had a non-ok response — should remain empty
    expect(result.current.types).toEqual([])
    // Others succeeded
    expect(result.current.requirementPackages).toEqual(samplePackages)
    expect(result.current.normReferences).toEqual(sampleNormRefs)
    expect(result.current.riskLevels).toEqual(sampleRiskLevels)
  })

  it('starts with loading true and transitions to false', async () => {
    setupFetchMock()

    const { result } = renderHook(() => useTaxonomyOptions(''))

    expect(result.current.loading).toBe(true)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
  })
})
