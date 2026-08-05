import { act, renderHook, waitFor } from '@testing-library/react'
import type { MouseEvent, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  DeviationData,
  SuggestionData,
} from '@/app/[locale]/requirements/[id]/_detail/types'
import { useDeviationWorkflow } from '@/app/[locale]/requirements/[id]/_detail/use-deviation-workflow'
import { useSuggestionWorkflow } from '@/app/[locale]/requirements/[id]/_detail/use-suggestion-workflow'
import type { RequirementDetailResponse } from '@/lib/requirements/types'

const apiFetchMock = vi.hoisted(() => vi.fn())
const confirmMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/http/api-fetch', () => ({ apiFetch: apiFetchMock }))
vi.mock('@/components/ConfirmModal', () => ({
  ConfirmModalProvider: ({ children }: { children: ReactNode }) => children,
  useConfirmModal: () => ({ confirm: confirmMock }),
}))
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

function response(body: unknown, ok = true, statusText = ok ? 'OK' : 'Error') {
  return {
    headers: new Headers({ 'content-type': 'application/json' }),
    json: vi.fn(async () => structuredClone(body)),
    ok,
    statusText,
    text: vi.fn(async () => JSON.stringify(body)),
  } as unknown as Response
}

const draftDeviation: DeviationData = {
  createdAt: '2026-08-01T10:00:00Z',
  createdBy: 'Owner',
  decidedAt: null,
  decidedBy: null,
  decision: null,
  decisionMotivation: null,
  id: 41,
  isReviewRequested: 0,
  motivation: 'A deviation',
}

const draftSuggestion: SuggestionData = {
  content: 'Improve wording',
  createdAt: '2026-08-01T10:00:00Z',
  createdBy: 'Author',
  id: 51,
  isReviewRequested: 0,
  requirementVersionId: 101,
  resolution: null,
  resolutionMotivation: null,
  resolvedAt: null,
  resolvedBy: null,
}

function requirement(): RequirementDetailResponse {
  return {
    id: 9,
    uniqueId: 'REQ-9',
    area: null,
    createdAt: '2026-08-01T10:00:00Z',
    isArchived: false,
    specificationCount: 0,
    versions: [
      { id: 101, versionNumber: 1 },
      { id: 102, versionNumber: 2 },
    ],
  } as RequirementDetailResponse
}

function mouseEvent(button: HTMLButtonElement) {
  return { currentTarget: button } as MouseEvent<HTMLButtonElement>
}

afterEach(() => vi.restoreAllMocks())

describe('useDeviationWorkflow coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    confirmMock.mockResolvedValue(true)
  })

  it('keeps unavailable actions inert and controls each dialog mode', async () => {
    const { result } = renderHook(() =>
      useDeviationWorkflow({ isSpecificationItemContext: false }),
    )

    expect(result.current.latestDeviation).toBeNull()
    expect(result.current.deviationHistory).toEqual([])
    expect(result.current.deviationStep).toBeNull()
    expect(apiFetchMock).not.toHaveBeenCalled()

    act(() => result.current.openCreateDialog())
    expect(result.current.showDeviationForm).toBe(true)
    act(() => result.current.openEditDialog())
    expect(result.current.showEditDeviationForm).toBe(true)
    act(() => result.current.openDecisionDialog())
    expect(result.current.showDecisionForm).toBe(true)
    act(() => result.current.closeDialog())
    expect(result.current.showDecisionForm).toBe(false)

    await act(async () => {
      await result.current.handleCreateDeviation('')
      await result.current.handleEditDeviation('')
      await result.current.handleDeleteDeviation()
      await result.current.handleRequestReview()
      await result.current.handleRevertToDraft()
      await result.current.handleRecordDecision(1, '')
    })
    expect(apiFetchMock).not.toHaveBeenCalled()
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('derives history and state and completes every deviation mutation', async () => {
    const previousDeviation: DeviationData = {
      ...draftDeviation,
      decision: 2,
      id: 40,
    }
    const onChange = vi.fn(async () => {})
    apiFetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === '/api/specification-item-deviations/7' && !init) {
          return response({ deviations: [previousDeviation, draftDeviation] })
        }
        return response({ ok: true })
      },
    )

    const { result } = renderHook(() =>
      useDeviationWorkflow({
        isSpecificationItemContext: true,
        onChange,
        specificationItemId: 7,
      }),
    )
    await waitFor(() => expect(result.current.latestDeviation?.id).toBe(41))
    expect(result.current.deviationHistory).toEqual([previousDeviation])
    expect(result.current.deviationStep).toBe('draft')

    act(() => result.current.openCreateDialog())
    await act(() => result.current.handleCreateDeviation(' New deviation '))
    expect(result.current.showDeviationForm).toBe(false)

    act(() => result.current.openEditDialog())
    await act(() => result.current.handleEditDeviation('Edited'))
    expect(result.current.showEditDeviationForm).toBe(false)

    await act(() => result.current.handleRequestReview())

    const deleteAnchor = document.createElement('button')
    await act(() =>
      result.current.handleDeleteDeviation(mouseEvent(deleteAnchor)),
    )
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        anchorEl: deleteAnchor,
        icon: 'caution',
        variant: 'danger',
      }),
    )

    const revertAnchor = document.createElement('button')
    await act(() =>
      result.current.handleRevertToDraft(mouseEvent(revertAnchor)),
    )
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        anchorEl: revertAnchor,
        icon: 'warning',
        variant: 'default',
      }),
    )

    act(() => result.current.openDecisionDialog())
    await act(() => result.current.handleRecordDecision(2, 'Not approved'))
    expect(result.current.showDecisionForm).toBe(false)
    expect(onChange).toHaveBeenCalledOnce()
    expect(result.current.deviationSaving).toBe(false)

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/deviations/41/decision',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          decision: 2,
          decisionMotivation: 'Not approved',
        }),
      }),
    )
    expect(apiFetchMock).toHaveBeenCalledWith('/api/deviations/41', {
      method: 'DELETE',
    })
  })

  it('derives review and decided states from refreshed data', async () => {
    let latest: DeviationData = { ...draftDeviation, isReviewRequested: 1 }
    apiFetchMock.mockImplementation(async () =>
      response({ deviations: [latest] }),
    )
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) =>
        useDeviationWorkflow({
          isSpecificationItemContext: true,
          specificationItemId: id,
        }),
      { initialProps: { id: 1 } },
    )
    await waitFor(() =>
      expect(result.current.deviationStep).toBe('review_requested'),
    )

    latest = { ...draftDeviation, decision: 1, id: 42 }
    rerender({ id: 2 })
    await waitFor(() => expect(result.current.deviationStep).toBe('decided'))
  })

  it('reports fetch and mutation failures and honors cancelled confirmations', async () => {
    apiFetchMock.mockResolvedValueOnce(response({}, false))
    const { result } = renderHook(() =>
      useDeviationWorkflow({
        isSpecificationItemContext: true,
        specificationItemId: 7,
      }),
    )
    await waitFor(() =>
      expect(result.current.deviationError).toBe('deviation.fetchFailed'),
    )

    apiFetchMock.mockRejectedValueOnce(new Error('network'))
    await act(() => result.current.handleCreateDeviation('Motivation'))
    expect(result.current.deviationError).toBe('deviation.saveFailed')

    apiFetchMock.mockResolvedValueOnce(
      response({ deviations: [draftDeviation] }),
    )
    act(() => result.current.openCreateDialog())
    await act(() => result.current.handleCreateDeviation('Reload'))
    await waitFor(() => expect(result.current.latestDeviation).not.toBeNull())

    apiFetchMock.mockResolvedValueOnce(response({}, false))
    await act(() => result.current.handleEditDeviation('Edit'))
    expect(result.current.deviationError).toBe('deviation.saveFailed')

    apiFetchMock.mockResolvedValueOnce(response({}, false))
    await act(() => result.current.handleRequestReview())
    expect(result.current.deviationError).toBe('deviation.reviewFailed')

    apiFetchMock.mockResolvedValueOnce(response({}, false))
    await act(() => result.current.handleDeleteDeviation())
    expect(result.current.deviationError).toBe('deviation.deleteFailed')

    apiFetchMock.mockResolvedValueOnce(response({}, false))
    await act(() => result.current.handleRevertToDraft())
    expect(result.current.deviationError).toBe('deviation.revertFailed')

    apiFetchMock.mockResolvedValueOnce(response({}, false))
    await act(() => result.current.handleRecordDecision(1, 'Approved'))
    expect(result.current.deviationError).toBe('deviation.decisionFailed')

    confirmMock.mockResolvedValue(false)
    apiFetchMock.mockClear()
    await act(() => result.current.handleDeleteDeviation())
    await act(() => result.current.handleRevertToDraft())
    expect(apiFetchMock).not.toHaveBeenCalled()
  })
})

describe('useSuggestionWorkflow coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    confirmMock.mockResolvedValue(true)
  })

  it('keeps unavailable mutations inert and derives every suggestion step', async () => {
    apiFetchMock.mockResolvedValue(response({ suggestions: [] }))
    const { result } = renderHook(() =>
      useSuggestionWorkflow({
        requirement: null,
        requirementId: 9,
        selectedVersionNumber: null,
      }),
    )
    await waitFor(() =>
      expect(result.current.versionSuggestionItems).toEqual([]),
    )
    expect(apiFetchMock).not.toHaveBeenCalled()

    expect(result.current.getSuggestionStep(draftSuggestion)).toBe('draft')
    expect(
      result.current.getSuggestionStep({
        ...draftSuggestion,
        isReviewRequested: 1,
      }),
    ).toBe('review_requested')
    expect(
      result.current.getSuggestionStep({ ...draftSuggestion, resolution: 2 }),
    ).toBe('resolved')

    await act(async () => {
      await result.current.handleCreateSuggestion('', '')
      await result.current.handleEditSuggestion('', '')
      await result.current.handleRecordResolution(1, '', '')
    })
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('filters the selected version and completes every suggestion mutation', async () => {
    const otherVersion = {
      ...draftSuggestion,
      id: 52,
      requirementVersionId: 102,
    }
    const unversioned = {
      ...draftSuggestion,
      id: 53,
      requirementVersionId: null,
    }
    const onChange = vi.fn(async () => {})
    apiFetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === '/api/requirement-suggestions/9' && !init) {
          return response({
            suggestions: [draftSuggestion, otherVersion, unversioned],
          })
        }
        return response({ ok: true })
      },
    )
    const { result, rerender } = renderHook(
      ({ selectedVersionNumber }: { selectedVersionNumber: number | null }) =>
        useSuggestionWorkflow({
          onChange,
          requirement: requirement(),
          requirementId: 9,
          selectedVersionNumber,
        }),
      { initialProps: { selectedVersionNumber: 1 as number | null } },
    )
    await waitFor(() =>
      expect(
        result.current.versionSuggestionItems.map(item => item.id),
      ).toEqual([51]),
    )

    rerender({ selectedVersionNumber: null })
    expect(result.current.versionSuggestionItems).toHaveLength(3)

    act(() => result.current.openCreateDialog())
    expect(result.current.showSuggestionForm).toBe(true)
    await act(() => result.current.handleCreateSuggestion(' New text ', ''))
    expect(result.current.showSuggestionForm).toBe(false)
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/requirement-suggestions/9',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          content: ' New text ',
          createdBy: null,
          requirementVersionId: null,
        }),
      }),
    )

    act(() => result.current.openEditDialog(draftSuggestion))
    expect(result.current.editSuggestionTarget).toBe(draftSuggestion)
    await act(() =>
      result.current.handleEditSuggestion('Edited text', 'Ignored'),
    )
    expect(result.current.showEditSuggestionForm).toBe(false)

    const deleteAnchor = document.createElement('button')
    await act(() =>
      result.current.handleDeleteSuggestion(51, mouseEvent(deleteAnchor)),
    )
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ anchorEl: deleteAnchor, variant: 'danger' }),
    )

    await act(() => result.current.handleSuggestionRequestReview(51))

    const revertAnchor = document.createElement('button')
    await act(() =>
      result.current.handleSuggestionRevertToDraft(
        51,
        mouseEvent(revertAnchor),
      ),
    )
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ anchorEl: revertAnchor, variant: 'default' }),
    )

    act(() => result.current.openResolutionDialog(draftSuggestion))
    expect(result.current.resolutionTarget).toBe(draftSuggestion)
    await act(() =>
      result.current.handleRecordResolution(1, 'Implemented', 'Reviewer'),
    )
    expect(result.current.showResolutionForm).toBe(false)
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/improvement-suggestions/51/resolution',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          resolution: 1,
          resolutionMotivation: 'Implemented',
          resolvedBy: 'Reviewer',
        }),
      }),
    )
    expect(onChange).toHaveBeenCalledTimes(6)
    expect(result.current.suggestionSaving).toBe(false)
  })

  it('reports fetch and mutation failures and honors cancelled confirmations', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    apiFetchMock.mockResolvedValueOnce(response({}, false))
    const { result } = renderHook(() =>
      useSuggestionWorkflow({
        requirement: requirement(),
        requirementId: 9,
        selectedVersionNumber: 1,
      }),
    )
    await waitFor(() =>
      expect(result.current.suggestionError).toBe(
        'improvementSuggestion.fetchFailed',
      ),
    )

    apiFetchMock.mockRejectedValueOnce(new Error('offline'))
    await act(() => result.current.handleCreateSuggestion('Text', 'Author'))
    expect(result.current.suggestionError).toBe(
      'improvementSuggestion.saveFailed',
    )

    apiFetchMock.mockResolvedValueOnce(
      response({ suggestions: [draftSuggestion] }),
    )
    act(() => result.current.openCreateDialog())
    await act(() => result.current.handleCreateSuggestion('Reload', 'Author'))
    await waitFor(() =>
      expect(result.current.versionSuggestionItems).toHaveLength(1),
    )

    act(() => result.current.openEditDialog(draftSuggestion))
    apiFetchMock.mockResolvedValueOnce(response({ error: 'bad edit' }, false))
    await act(() => result.current.handleEditSuggestion('Edit', ''))
    expect(result.current.suggestionError).toBe(
      'improvementSuggestion.saveFailed',
    )

    apiFetchMock.mockResolvedValueOnce(response({}, false))
    await act(() => result.current.handleSuggestionRequestReview(51))
    expect(result.current.suggestionError).toBe(
      'improvementSuggestion.reviewFailed',
    )

    apiFetchMock.mockResolvedValueOnce(response({}, false))
    await act(() => result.current.handleDeleteSuggestion(51))
    expect(result.current.suggestionError).toBe(
      'improvementSuggestion.deleteFailed',
    )

    apiFetchMock.mockResolvedValueOnce(response({}, false))
    await act(() => result.current.handleSuggestionRevertToDraft(51))
    expect(result.current.suggestionError).toBe(
      'improvementSuggestion.revertFailed',
    )

    act(() => result.current.openResolutionDialog(draftSuggestion))
    apiFetchMock.mockRejectedValueOnce('unavailable')
    await act(() =>
      result.current.handleRecordResolution(2, 'No change', 'Reviewer'),
    )
    expect(result.current.suggestionError).toBe(
      'improvementSuggestion.resolutionFailed',
    )

    confirmMock.mockResolvedValue(false)
    apiFetchMock.mockClear()
    await act(() => result.current.handleDeleteSuggestion(51))
    await act(() => result.current.handleSuggestionRevertToDraft(51))
    expect(apiFetchMock).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
  })

  it('closes every suggestion dialog explicitly', async () => {
    apiFetchMock.mockResolvedValue(response({ suggestions: [] }))
    const { result } = renderHook(() =>
      useSuggestionWorkflow({
        requirement: requirement(),
        requirementId: 9,
        selectedVersionNumber: 1,
      }),
    )
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())

    act(() => result.current.openEditDialog(draftSuggestion))
    act(() => result.current.closeDialog())
    expect(result.current.editSuggestionTarget).toBeNull()
    act(() => result.current.openResolutionDialog(draftSuggestion))
    act(() => result.current.closeDialog())
    expect(result.current.resolutionTarget).toBeNull()
  })
})
