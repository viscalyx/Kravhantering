import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}))

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve = (_value: T) => {}
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    json: async () => body,
    ok: status >= 200 && status < 300,
    status,
  } as unknown as Response
}

function malformedJsonResponse(): Response {
  return {
    json: async () => {
      throw new SyntaxError('Unexpected response content')
    },
    ok: true,
    status: 200,
  } as unknown as Response
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import RequirementTypesClient from '@/app/[locale]/requirement-types/requirement-types-client'

const sampleTypes = [
  { id: 1, nameSv: 'Typ A sv', nameEn: 'Type A' },
  { id: 2, nameSv: 'Typ B sv', nameEn: 'Type B' },
]

const sampleCategories = [
  {
    chapterId: '3.7',
    id: 10,
    nameSv: 'Kat sv',
    nameEn: 'Cat en',
    parentId: null,
    requirementTypeId: 1,
  },
  {
    chapterId: '3.7.3',
    id: 11,
    nameSv: 'Barn sv',
    nameEn: 'Child en',
    parentId: 10,
    requirementTypeId: 1,
  },
]

function successfulCatalogFetch(url: string): Promise<Response> {
  if (url === '/api/requirement-types') {
    return Promise.resolve(jsonResponse({ types: sampleTypes }))
  }
  if (url === '/api/quality-characteristics') {
    return Promise.resolve(
      jsonResponse({ qualityCharacteristics: sampleCategories }),
    )
  }
  return Promise.resolve(jsonResponse({}))
}

describe('RequirementTypesClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockImplementation(successfulCatalogFetch)
  })

  it('keeps the page heading visible while both sources load', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))

    render(<RequirementTypesClient />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.types',
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'requirementTypesPage.loading.types',
    )
  })

  it('fetches independent sources with their abort signals', async () => {
    render(<RequirementTypesClient />)

    await screen.findByText('Type A')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/requirement-types',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/quality-characteristics',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('renders types progressively with one shared quality loading status', async () => {
    const categoriesRequest = deferred<Response>()
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-types') {
        return Promise.resolve(jsonResponse({ types: sampleTypes }))
      }
      return categoriesRequest.promise
    })

    render(<RequirementTypesClient />)

    await screen.findByText('Type A')
    const loadingStatus = screen.getByRole('status')
    expect(loadingStatus).toHaveTextContent(
      'requirementTypesPage.loading.qualityCharacteristics',
    )
    expect(screen.getAllByRole('status')).toHaveLength(1)
    const visibleLoadingMessages = screen
      .getAllByText('requirementTypesPage.loading.qualityCharacteristics')
      .filter(message => message !== loadingStatus)
    expect(visibleLoadingMessages).toHaveLength(sampleTypes.length)
    for (const message of visibleLoadingMessages) {
      expect(message).not.toHaveAttribute('role')
    }
    expect(
      screen.getAllByText('help.requirementTypes.quality.heading'),
    ).toHaveLength(sampleTypes.length)
  })

  it('retains type cards and shows unavailable characteristics when that source fails', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-types') {
        return Promise.resolve(jsonResponse({ types: sampleTypes }))
      }
      return Promise.resolve(jsonResponse({}, 503))
    })

    const { container } = render(<RequirementTypesClient />)

    await screen.findByText('Type A')
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(
      'requirementTypesPage.sources.qualityCharacteristics',
    )
    expect(alert).toHaveTextContent('requirementTypesPage.reasons.server')
    expect(
      screen.getAllByText(
        'requirementTypesPage.unavailable.qualityCharacteristics',
      ),
    ).toHaveLength(sampleTypes.length)
    expect(screen.queryByText('common.noResults')).not.toBeInTheDocument()
    expect(
      container.querySelector(
        '[data-developer-mode-name="source error alert"]',
      ),
    ).toBe(alert)
    expect(
      container.querySelector('[data-developer-mode-name="retry action"]'),
    ).toBe(screen.getByRole('button', { name: 'common.retry' }))
  })

  it('reports loaded characteristics that cannot be organized when types fail', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-types') {
        return Promise.resolve(jsonResponse({}, 503))
      }
      return Promise.resolve(
        jsonResponse({ qualityCharacteristics: sampleCategories }),
      )
    })

    render(<RequirementTypesClient />)

    expect(
      await screen.findByText(
        'requirementTypesPage.unavailable.typesWithQualityLoaded',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'requirementTypesPage.sources.types',
    )
    expect(screen.queryByText('Cat en')).not.toBeInTheDocument()
  })

  it('lists both failed sources in one alert', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 503))

    render(<RequirementTypesClient />)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getAllByRole('listitem')).toHaveLength(2)
    expect(alert).toHaveTextContent('requirementTypesPage.sources.types')
    expect(alert).toHaveTextContent(
      'requirementTypesPage.sources.qualityCharacteristics',
    )
    expect(
      within(alert).getAllByRole('button', { name: 'common.retry' }),
    ).toHaveLength(1)
  })

  it.each([
    {
      failure: () => Promise.reject(new Error('private network detail')),
      name: 'network failures',
      reason: 'network',
    },
    {
      failure: () => Promise.resolve(jsonResponse({ private: 'body' }, 502)),
      name: 'non-OK responses',
      reason: 'server',
    },
    {
      failure: () => Promise.resolve(malformedJsonResponse()),
      name: 'malformed JSON',
      reason: 'invalidResponse',
    },
    {
      failure: () => Promise.resolve(jsonResponse({})),
      name: 'missing expected properties',
      reason: 'invalidResponse',
    },
    {
      failure: () => Promise.resolve(jsonResponse({ types: {} })),
      name: 'non-array catalog values',
      reason: 'invalidResponse',
    },
  ])('classifies $name without exposing technical details', async scenario => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-types') return scenario.failure()
      return Promise.resolve(
        jsonResponse({ qualityCharacteristics: sampleCategories }),
      )
    })

    render(<RequirementTypesClient />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      `requirementTypesPage.reasons.${scenario.reason}`,
    )
    expect(alert).not.toHaveTextContent('private')
    expect(alert).not.toHaveTextContent('502')
  })

  it('uses the reauthentication flow instead of a catalog-server alert for 401', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-types') {
        return Promise.resolve(jsonResponse({}, 401))
      }
      return Promise.resolve(
        jsonResponse({ qualityCharacteristics: sampleCategories }),
      )
    })

    render(<RequirementTypesClient />)

    expect(
      await screen.findByText(
        'requirementTypesPage.unavailable.typesWithQualityLoaded',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'common.retry' }),
    ).not.toBeInTheDocument()
  })

  it('renders one page-level empty state for an explicit empty types array', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-types') {
        return Promise.resolve(jsonResponse({ types: [] }))
      }
      return Promise.resolve(
        jsonResponse({ qualityCharacteristics: sampleCategories }),
      )
    })

    render(<RequirementTypesClient />)

    expect(
      await screen.findByText('requirementTypesPage.empty.types'),
    ).toBeInTheDocument()
    expect(screen.queryByText('common.noResults')).not.toBeInTheDocument()
  })

  it('keeps per-type no-results states for an explicit empty characteristics array', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-types') {
        return Promise.resolve(jsonResponse({ types: sampleTypes }))
      }
      return Promise.resolve(jsonResponse({ qualityCharacteristics: [] }))
    })

    render(<RequirementTypesClient />)

    expect(await screen.findAllByText('common.noResults')).toHaveLength(
      sampleTypes.length,
    )
  })

  it('retries only the failed source and preserves successful type data', async () => {
    let characteristicsCalls = 0
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-types') {
        return Promise.resolve(jsonResponse({ types: sampleTypes }))
      }
      characteristicsCalls += 1
      return Promise.resolve(
        characteristicsCalls === 1
          ? jsonResponse({}, 503)
          : jsonResponse({ qualityCharacteristics: sampleCategories }),
      )
    })

    render(<RequirementTypesClient />)

    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))

    expect(
      await screen.findByText('requirementTypesPage.recovered'),
    ).toHaveAttribute('role', 'status')
    expect(screen.getByText('Type A')).toBeInTheDocument()
    expect(screen.getByText('Cat en')).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.filter(([url]) => url === '/api/requirement-types'),
    ).toHaveLength(1)
    expect(
      fetchMock.mock.calls.filter(
        ([url]) => url === '/api/quality-characteristics',
      ),
    ).toHaveLength(2)
  })

  it('retries both sources concurrently when both failed', async () => {
    const calls = new Map<string, number>()
    fetchMock.mockImplementation((url: string) => {
      const nextCall = (calls.get(url) ?? 0) + 1
      calls.set(url, nextCall)
      if (nextCall === 1) return Promise.resolve(jsonResponse({}, 503))
      return successfulCatalogFetch(url)
    })

    render(<RequirementTypesClient />)

    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))

    await screen.findByText('Cat en')
    expect(screen.getByRole('status')).toHaveTextContent(
      'requirementTypesPage.recovered',
    )
    expect(calls.get('/api/requirement-types')).toBe(2)
    expect(calls.get('/api/quality-characteristics')).toBe(2)
  })

  it('disables duplicate retry while failed sources are pending', async () => {
    const typesRetry = deferred<Response>()
    const characteristicsRetry = deferred<Response>()
    const calls = new Map<string, number>()
    fetchMock.mockImplementation((url: string) => {
      const nextCall = (calls.get(url) ?? 0) + 1
      calls.set(url, nextCall)
      if (nextCall === 1) return Promise.resolve(jsonResponse({}, 503))
      return url === '/api/requirement-types'
        ? typesRetry.promise
        : characteristicsRetry.promise
    })

    render(<RequirementTypesClient />)

    await screen.findByRole('alert')
    const retry = screen.getByRole('button', { name: 'common.retry' })
    fireEvent.click(retry)

    expect(
      screen.getByRole('button', {
        name: 'requirementTypesPage.retrying',
      }),
    ).toBeDisabled()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'requirementTypesPage.retrying',
      }),
    )
    expect(calls.get('/api/requirement-types')).toBe(2)
    expect(calls.get('/api/quality-characteristics')).toBe(2)
  })

  it('retains the alert after repeated failure and confirms later recovery', async () => {
    let characteristicsCalls = 0
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-types') {
        return Promise.resolve(jsonResponse({ types: sampleTypes }))
      }
      characteristicsCalls += 1
      return Promise.resolve(
        characteristicsCalls < 3
          ? jsonResponse({}, 503)
          : jsonResponse({ qualityCharacteristics: sampleCategories }),
      )
    })

    const { container } = render(<RequirementTypesClient />)

    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'common.retry' })).toBeEnabled()
    })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('requirementTypesPage.recovered')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))

    expect(
      await screen.findByText('requirementTypesPage.recovered'),
    ).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      container.querySelector('[data-developer-mode-name="recovery status"]'),
    ).toHaveTextContent('requirementTypesPage.recovered')
  })

  it('renders ISO badges, semantic quality headings, and responsive grids', async () => {
    const { container } = render(<RequirementTypesClient />)

    await screen.findByText('Type A')
    expect(screen.getAllByText('ISO/IEC 25010:2023')).toHaveLength(
      sampleTypes.length,
    )
    const qualityHeadings = screen
      .getAllByRole('heading', { level: 3 })
      .filter(
        heading =>
          heading.textContent === 'help.requirementTypes.quality.heading',
      )
    expect(qualityHeadings).toHaveLength(sampleTypes.length)
    expect(
      container.querySelector('.grid-cols-1.lg\\:grid-cols-2'),
    ).toBeInTheDocument()
    expect(
      container.querySelectorAll('[data-developer-mode-name="type card"]'),
    ).toHaveLength(sampleTypes.length)
  })

  it('sorts quality characteristics by chapter number', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-types') {
        return Promise.resolve(jsonResponse({ types: sampleTypes }))
      }
      return Promise.resolve(
        jsonResponse({
          qualityCharacteristics: [
            {
              chapterId: '3.7',
              id: 10,
              nameSv: 'Underhållbarhet',
              nameEn: 'Maintainability',
              parentId: null,
              requirementTypeId: 1,
            },
            {
              chapterId: '3.7.2',
              id: 12,
              nameSv: 'Återanvändbarhet',
              nameEn: 'Reusability',
              parentId: 10,
              requirementTypeId: 1,
            },
            {
              chapterId: '3.2',
              id: 13,
              nameSv: 'Prestandaeffektivitet',
              nameEn: 'Performance efficiency',
              parentId: null,
              requirementTypeId: 1,
            },
            {
              chapterId: '3.7.1',
              id: 11,
              nameSv: 'Modularitet',
              nameEn: 'Modularity',
              parentId: 10,
              requirementTypeId: 1,
            },
          ],
        }),
      )
    })

    render(<RequirementTypesClient />)

    await screen.findByText('Performance efficiency')
    const text = document.body.textContent ?? ''
    expect(text.indexOf('3.2')).toBeLessThan(text.indexOf('3.7'))
    expect(text.indexOf('3.7.1')).toBeLessThan(text.indexOf('3.7.2'))
  })
})
