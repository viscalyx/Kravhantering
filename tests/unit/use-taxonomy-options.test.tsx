import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaxonomyOptions } from '@/hooks/useTaxonomyOptions'

function response(body: unknown, ok = true): Response {
  return {
    json: async () => body,
    ok,
    status: ok ? 200 : 503,
  } as Response
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(next => {
    resolve = next
  })
  return { promise, resolve }
}

const sampleAreas = [
  { id: 1, name: 'Area 1', ownerHsaId: 'SE5560000001-area1' },
]
const sampleCategories = [{ id: 1, nameEn: 'Category', nameSv: 'Kategori' }]
const sampleTypes = [{ id: 1, nameEn: 'Type', nameSv: 'Typ' }]
const samplePackages = [
  {
    id: 7,
    isArchived: true,
    name: 'Archived package',
    purposeAndScope: 'Retained selection',
  },
]
const sampleNormReferences = [
  {
    id: 3,
    isArchived: true,
    name: 'Archived norm',
    normReferenceId: 'NR-3',
  },
]
const samplePriorityLevels = [
  {
    assessmentCriteriaEn: 'Assessment',
    assessmentCriteriaSv: 'Bedömning',
    code: 'P2',
    color: '#22c55e',
    descriptionEn: 'Description',
    descriptionSv: 'Beskrivning',
    iconName: null,
    id: 2,
    nameEn: 'Low',
    nameSv: 'Låg',
  },
]
const sampleQualityCharacteristics = [
  { id: 10, nameEn: 'Security', nameSv: 'Säkerhet', parentId: null },
]

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function setupSuccessfulFetches(options: { emptyAreas?: boolean } = {}) {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = input.toString()
    if (url.startsWith('/api/requirement-areas')) {
      return Promise.resolve(
        response({ areas: options.emptyAreas ? [] : sampleAreas }),
      )
    }
    if (url.startsWith('/api/requirement-categories')) {
      return Promise.resolve(response({ categories: sampleCategories }))
    }
    if (url.startsWith('/api/requirement-types')) {
      return Promise.resolve(response({ types: sampleTypes }))
    }
    if (url.startsWith('/api/requirement-packages')) {
      return Promise.resolve(response({ requirementPackages: samplePackages }))
    }
    if (url.startsWith('/api/norm-references')) {
      return Promise.resolve(response({ normReferences: sampleNormReferences }))
    }
    if (url.startsWith('/api/priority-levels')) {
      return Promise.resolve(response({ priorityLevels: samplePriorityLevels }))
    }
    if (url.startsWith('/api/quality-characteristics')) {
      return Promise.resolve(
        response({
          qualityCharacteristics: sampleQualityCharacteristics,
        }),
      )
    }
    return Promise.resolve(response({}))
  })
}

function callsFor(path: string): number {
  return fetchMock.mock.calls.filter(([input]) =>
    input.toString().startsWith(path),
  ).length
}

describe('useTaxonomyOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads all library catalogs and includes normalized selected IDs', async () => {
    setupSuccessfulFetches()

    const { result } = renderHook(() =>
      useTaxonomyOptions('', [5, 3, 5], {
        selectedRequirementPackageIds: [7, 7],
        variant: 'library',
      }),
    )

    expect(result.current.readiness.canSave).toBe(false)
    await waitFor(() => expect(result.current.readiness.canSave).toBe(true))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/norm-references?includeIds=3&includeIds=5',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/requirement-packages?includeIds=7',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(result.current.requirementPackages).toEqual(samplePackages)
    expect(result.current.normReferences).toEqual(sampleNormReferences)
  })

  it('normalizes all 200 hydration IDs without silently truncating them', async () => {
    setupSuccessfulFetches()
    const ids = [
      ...Array.from({ length: 200 }, (_value, index) => 200 - index),
      1,
      0,
      -1,
      1.5,
    ]

    const { result } = renderHook(() =>
      useTaxonomyOptions('', ids, { variant: 'specificationLocal' }),
    )

    await waitFor(() => expect(result.current.readiness.canSave).toBe(true))

    const normReferenceCall = fetchMock.mock.calls.find(([input]) =>
      input.toString().startsWith('/api/norm-references?'),
    )
    expect(normReferenceCall).toBeDefined()
    const url = new URL(normReferenceCall?.[0].toString() ?? '', 'http://local')
    expect(url.searchParams.getAll('includeIds')).toEqual(
      Array.from({ length: 200 }, (_value, index) => String(index + 1)),
    )
  })

  it('omits hidden library-only endpoints for a specification-local form', async () => {
    setupSuccessfulFetches()

    const { result } = renderHook(() =>
      useTaxonomyOptions('', [], { variant: 'specificationLocal' }),
    )

    await waitFor(() => expect(result.current.readiness.canSave).toBe(true))

    expect(callsFor('/api/requirement-areas')).toBe(0)
    expect(callsFor('/api/requirement-packages')).toBe(0)
    expect(callsFor('/api/requirement-categories')).toBe(1)
    expect(callsFor('/api/norm-references')).toBe(1)
  })

  it('treats successful empty optional catalogs as ready', async () => {
    fetchMock.mockResolvedValue(response({}))

    const { result } = renderHook(() =>
      useTaxonomyOptions('', [], { variant: 'specificationLocal' }),
    )

    await waitFor(() => expect(result.current.readiness.canSave).toBe(true))
    expect(result.current.categories).toEqual([])
    expect(result.current.readiness.failedCatalogs).toEqual([])
  })

  it('reports an empty requirement-area catalog as a configuration blocker', async () => {
    setupSuccessfulFetches({ emptyAreas: true })

    const { result } = renderHook(() => useTaxonomyOptions(''))

    await waitFor(() =>
      expect(result.current.readiness.loadingCatalogs).toEqual([]),
    )
    expect(result.current.readiness.canSave).toBe(false)
    expect(result.current.readiness.emptyRequiredCatalogs).toEqual(['areas'])
  })

  it('retries only initially failed resources and preserves successful data', async () => {
    let categoryAttempts = 0
    setupSuccessfulFetches()
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.startsWith('/api/requirement-categories')) {
        categoryAttempts += 1
        return Promise.resolve(
          categoryAttempts === 1
            ? response({}, false)
            : response({ categories: sampleCategories }),
        )
      }
      if (url.startsWith('/api/requirement-types')) {
        return Promise.resolve(response({ types: sampleTypes }))
      }
      if (url.startsWith('/api/norm-references')) {
        return Promise.resolve(
          response({ normReferences: sampleNormReferences }),
        )
      }
      if (url.startsWith('/api/priority-levels')) {
        return Promise.resolve(
          response({ priorityLevels: samplePriorityLevels }),
        )
      }
      return Promise.resolve(response({}))
    })

    const { result } = renderHook(() =>
      useTaxonomyOptions('', [], { variant: 'specificationLocal' }),
    )

    await waitFor(() =>
      expect(result.current.readiness.failedCatalogs).toEqual(['categories']),
    )
    expect(result.current.types).toEqual(sampleTypes)
    expect(callsFor('/api/requirement-types')).toBe(1)

    await act(async () => {
      await result.current.readiness.retryFailed()
    })

    await waitFor(() => expect(result.current.readiness.canSave).toBe(true))
    expect(categoryAttempts).toBe(2)
    expect(callsFor('/api/requirement-types')).toBe(1)
  })

  it('keeps a complete last-known-good snapshot after refresh failure', async () => {
    let failCategories = false
    setupSuccessfulFetches()
    const initialImplementation = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (
          failCategories &&
          input.toString().startsWith('/api/requirement-categories')
        ) {
          return Promise.resolve(response({}, false))
        }
        return initialImplementation?.(input, init)
      },
    )

    const { result } = renderHook(() =>
      useTaxonomyOptions('', [], { variant: 'specificationLocal' }),
    )
    await waitFor(() => expect(result.current.readiness.canSave).toBe(true))

    failCategories = true
    await act(async () => {
      await result.current.refresh()
    })

    await waitFor(() =>
      expect(result.current.readiness.refreshFailedCatalogs).toEqual([
        'categories',
      ]),
    )
    expect(result.current.readiness.canSave).toBe(true)
    expect(result.current.categories).toEqual(sampleCategories)
  })

  it('does not refetch when selected IDs only change order or contain duplicates', async () => {
    setupSuccessfulFetches()

    const { rerender, result } = renderHook(
      ({ ids }: { ids: number[] }) =>
        useTaxonomyOptions('', ids, { variant: 'specificationLocal' }),
      { initialProps: { ids: [3, 5] } },
    )
    await waitFor(() => expect(result.current.readiness.canSave).toBe(true))

    const normReferenceCalls = callsFor('/api/norm-references')
    rerender({ ids: [5, 3, 3] })

    await waitFor(() =>
      expect(result.current.readiness.loadingCatalogs).toEqual([]),
    )
    expect(callsFor('/api/norm-references')).toBe(normReferenceCalls)
  })

  it('blocks a new type key and ignores the superseded quality response', async () => {
    const first = deferred<Response>()
    const second = deferred<Response>()
    setupSuccessfulFetches()
    const initialImplementation = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString()
        if (url === '/api/quality-characteristics?typeId=1') {
          return first.promise
        }
        if (url === '/api/quality-characteristics?typeId=2') {
          return second.promise
        }
        return initialImplementation?.(input, init)
      },
    )

    const { rerender, result } = renderHook(
      ({ typeId }: { typeId: string }) =>
        useTaxonomyOptions(typeId, [], {
          variant: 'specificationLocal',
        }),
      { initialProps: { typeId: '1' } },
    )
    await waitFor(() =>
      expect(callsFor('/api/quality-characteristics')).toBe(1),
    )

    rerender({ typeId: '2' })
    await waitFor(() =>
      expect(callsFor('/api/quality-characteristics')).toBe(2),
    )
    expect(result.current.readiness.canSave).toBe(false)

    const latest = [
      { id: 20, nameEn: 'Latest', nameSv: 'Senaste', parentId: null },
    ]
    await act(async () => {
      second.resolve(response({ qualityCharacteristics: latest }))
      await second.promise
    })
    await waitFor(() => expect(result.current.readiness.canSave).toBe(true))
    expect(result.current.qualityCharacteristics).toEqual(latest)

    await act(async () => {
      first.resolve(
        response({
          qualityCharacteristics: sampleQualityCharacteristics,
        }),
      )
      await first.promise
    })
    expect(result.current.qualityCharacteristics).toEqual(latest)
  })
})
