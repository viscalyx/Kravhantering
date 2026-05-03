import { act, renderHook, waitFor } from '@testing-library/react'
import type { MutableRefObject, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDeviationWorkflow } from '@/app/[locale]/requirements/[id]/_detail/use-deviation-workflow'
import { useSuggestionWorkflow } from '@/app/[locale]/requirements/[id]/_detail/use-suggestion-workflow'
import { useVersionPillConnector } from '@/app/[locale]/requirements/[id]/_detail/use-version-pill-connector'
import { ConfirmModalProvider } from '@/components/ConfirmModal'
import type { RequirementDetailResponse } from '@/lib/requirements/types'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

function response(body: unknown, ok = true) {
  return {
    json: async () => structuredClone(body),
    ok,
    statusText: ok ? 'OK' : 'Error',
  } as Response
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolver => {
    resolve = resolver
  })

  return { promise, resolve }
}

function wrapper({ children }: { children: ReactNode }) {
  return <ConfirmModalProvider>{children}</ConfirmModalProvider>
}

function makeRequirement(versionId: number): RequirementDetailResponse {
  return {
    id: 123,
    uniqueId: 'REQ-123',
    area: null,
    createdAt: '2026-03-01T00:00:00Z',
    isArchived: false,
    specificationCount: 0,
    versions: [
      {
        id: versionId,
        versionNumber: 1,
      },
    ],
  } as RequirementDetailResponse
}

function domRect({
  bottom,
  height,
  left,
  right,
  top,
  width,
}: {
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
}): DOMRect {
  return {
    bottom,
    height,
    left,
    right,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function mockRect(element: Element, rect: Parameters<typeof domRect>[0]) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(domRect(rect))
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useDeviationWorkflow', () => {
  it('clears the previous deviation while a new specification item fetch is pending', async () => {
    const secondFetch = createDeferred<Response>()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/specification-item-deviations/1') {
        return response({
          deviations: [
            {
              createdAt: '2026-03-01',
              createdBy: 'Owner',
              decidedAt: null,
              decidedBy: null,
              decision: null,
              decisionMotivation: null,
              id: 11,
              isReviewRequested: 1,
              motivation: 'Old specification deviation',
            },
          ],
        })
      }
      if (url === '/api/specification-item-deviations/2') {
        return secondFetch.promise
      }
      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ specificationItemId }: { specificationItemId: number }) =>
        useDeviationWorkflow({
          isSpecificationItemContext: true,
          specificationItemId,
        }),
      {
        initialProps: { specificationItemId: 1 },
        wrapper,
      },
    )

    await waitFor(() => expect(result.current.latestDeviation?.id).toBe(11))

    rerender({ specificationItemId: 2 })

    await waitFor(() => expect(result.current.latestDeviation).toBeNull())
    expect(result.current.deviationError).toBeNull()

    await act(async () => {
      secondFetch.resolve(response({ deviations: [] }, false))
    })

    await waitFor(() =>
      expect(result.current.deviationError).toBe('deviation.fetchFailed'),
    )
    expect(result.current.latestDeviation).toBeNull()
  })

  it('ignores stale deviation responses after a newer specification item fetch wins', async () => {
    const firstFetch = createDeferred<Response>()
    const secondFetch = createDeferred<Response>()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/specification-item-deviations/1') {
        return firstFetch.promise
      }
      if (url === '/api/specification-item-deviations/2') {
        return secondFetch.promise
      }
      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ specificationItemId }: { specificationItemId: number }) =>
        useDeviationWorkflow({
          isSpecificationItemContext: true,
          specificationItemId,
        }),
      {
        initialProps: { specificationItemId: 1 },
        wrapper,
      },
    )

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/specification-item-deviations/1',
      ),
    )

    rerender({ specificationItemId: 2 })

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/specification-item-deviations/2',
      ),
    )

    await act(async () => {
      secondFetch.resolve(
        response({
          deviations: [
            {
              createdAt: '2026-03-02',
              createdBy: 'Owner',
              decidedAt: null,
              decidedBy: null,
              decision: null,
              decisionMotivation: null,
              id: 22,
              isReviewRequested: 1,
              motivation: 'New specification deviation',
            },
          ],
        }),
      )
    })

    await waitFor(() => expect(result.current.latestDeviation?.id).toBe(22))

    await act(async () => {
      firstFetch.resolve(
        response({
          deviations: [
            {
              createdAt: '2026-03-01',
              createdBy: 'Owner',
              decidedAt: null,
              decidedBy: null,
              decision: null,
              decisionMotivation: null,
              id: 11,
              isReviewRequested: 0,
              motivation: 'Old specification deviation',
            },
          ],
        }),
      )
    })

    expect(result.current.latestDeviation?.id).toBe(22)
    expect(result.current.deviationError).toBeNull()
  })
})

describe('useSuggestionWorkflow', () => {
  it('clears previous suggestions while a new requirement fetch is pending', async () => {
    const secondFetch = createDeferred<Response>()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/requirement-suggestions/1') {
        return response({
          suggestions: [
            {
              content: 'Old requirement suggestion',
              createdAt: '2026-03-01',
              createdBy: 'Reviewer',
              id: 21,
              isReviewRequested: 0,
              requirementVersionId: 1,
              resolution: null,
              resolutionMotivation: null,
              resolvedAt: null,
              resolvedBy: null,
            },
          ],
        })
      }
      if (url === '/api/requirement-suggestions/2') {
        return secondFetch.promise
      }
      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ requirementId }: { requirementId: number }) =>
        useSuggestionWorkflow({
          requirement: makeRequirement(1),
          requirementId,
          selectedVersionNumber: 1,
        }),
      {
        initialProps: { requirementId: 1 },
        wrapper,
      },
    )

    await waitFor(() =>
      expect(result.current.versionSuggestionItems).toHaveLength(1),
    )

    rerender({ requirementId: 2 })

    await waitFor(() =>
      expect(result.current.versionSuggestionItems).toHaveLength(0),
    )
    expect(result.current.suggestionError).toBeNull()

    await act(async () => {
      secondFetch.resolve(response({ suggestions: [] }, false))
    })

    await waitFor(() =>
      expect(result.current.suggestionError).toBe(
        'improvementSuggestion.fetchFailed',
      ),
    )
    expect(result.current.versionSuggestionItems).toHaveLength(0)
  })

  it('ignores stale suggestion responses after a newer requirement fetch wins', async () => {
    const firstFetch = createDeferred<Response>()
    const secondFetch = createDeferred<Response>()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/requirement-suggestions/1') {
        return firstFetch.promise
      }
      if (url === '/api/requirement-suggestions/2') {
        return secondFetch.promise
      }
      throw new Error(`Unhandled fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ requirementId }: { requirementId: number }) =>
        useSuggestionWorkflow({
          requirement: makeRequirement(1),
          requirementId,
          selectedVersionNumber: 1,
        }),
      {
        initialProps: { requirementId: 1 },
        wrapper,
      },
    )

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/requirement-suggestions/1'),
    )

    rerender({ requirementId: 2 })

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/requirement-suggestions/2'),
    )

    await act(async () => {
      secondFetch.resolve(
        response({
          suggestions: [
            {
              content: 'New requirement suggestion',
              createdAt: '2026-03-02',
              createdBy: 'Reviewer',
              id: 22,
              isReviewRequested: 0,
              requirementVersionId: 1,
              resolution: null,
              resolutionMotivation: null,
              resolvedAt: null,
              resolvedBy: null,
            },
          ],
        }),
      )
    })

    await waitFor(() =>
      expect(result.current.versionSuggestionItems).toHaveLength(1),
    )
    expect(result.current.versionSuggestionItems[0]?.id).toBe(22)

    await act(async () => {
      firstFetch.resolve(
        response({
          suggestions: [
            {
              content: 'Old requirement suggestion',
              createdAt: '2026-03-01',
              createdBy: 'Reviewer',
              id: 11,
              isReviewRequested: 0,
              requirementVersionId: 1,
              resolution: null,
              resolutionMotivation: null,
              resolvedAt: null,
              resolvedBy: null,
            },
          ],
        }),
      )
    })

    expect(result.current.versionSuggestionItems[0]?.id).toBe(22)
    expect(result.current.suggestionError).toBeNull()
  })
})

describe('useVersionPillConnector', () => {
  it('clears connector height when the selected pill is unavailable', async () => {
    const { result, rerender } = renderHook(
      ({ selectedVersionNumber }: { selectedVersionNumber: null | number }) =>
        useVersionPillConnector(selectedVersionNumber),
      {
        initialProps: { selectedVersionNumber: null as number | null },
      },
    )

    const card = document.createElement('div')
    const versionHistory = document.createElement('div')
    const firstPill = document.createElement('button')
    const selectedPill = document.createElement('button')
    firstPill.dataset.versionNumber = '1'
    selectedPill.dataset.versionNumber = '2'
    versionHistory.append(firstPill, selectedPill)

    mockRect(card, {
      bottom: 100,
      height: 100,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
    })
    mockRect(firstPill, {
      bottom: 140,
      height: 20,
      left: 20,
      right: 60,
      top: 120,
      width: 40,
    })
    mockRect(selectedPill, {
      bottom: 190,
      height: 20,
      left: 30,
      right: 70,
      top: 170,
      width: 40,
    })

    ;(
      result.current.cardRef as MutableRefObject<HTMLDivElement | null>
    ).current = card
    ;(
      result.current
        .versionHistoryRef as MutableRefObject<HTMLDivElement | null>
    ).current = versionHistory

    rerender({ selectedVersionNumber: 2 })

    await waitFor(() => expect(result.current.connectorHeight).toBe(58))

    rerender({ selectedVersionNumber: null })

    await waitFor(() => expect(result.current.connectorHeight).toBeNull())
    expect(result.current.triangleLeft).toBeNull()

    rerender({ selectedVersionNumber: 2 })
    await waitFor(() => expect(result.current.connectorHeight).toBe(58))

    rerender({ selectedVersionNumber: 99 })

    await waitFor(() => expect(result.current.connectorHeight).toBeNull())
    expect(result.current.triangleLeft).toBeNull()
  })
})
