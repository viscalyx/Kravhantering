import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SpecificationRequirementSelectionPanel from '@/app/[locale]/specifications/[specificationId]/specification-requirement-selection-panel'

const translate = Object.assign(
  (key: string, params?: Record<string, unknown>) => {
    if (!params) return key
    return Object.entries(params).reduce(
      (value, [paramKey, paramValue]) =>
        value.replace(`{${paramKey}}`, String(paramValue)),
      key,
    )
  },
  {
    rich: (key: string) => key,
  },
)

vi.mock('next-intl', () => ({
  useTranslations: () => translate,
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({
    confirm: vi.fn().mockResolvedValue(true),
  }),
}))

function okJson(body: unknown) {
  return {
    json: async () => body,
    ok: true,
  }
}

const fetchMock = vi.fn()

function baselineQuestion() {
  return {
    answers: [
      {
        alreadyAddedRequirementCount: 0,
        description: null,
        id: 101,
        isActive: true,
        isArchived: false,
        isNoRequirementSelection: false,
        matchingRequirementCount: 1,
        text: 'Use baseline',
      },
    ],
    areaName: 'Security',
    id: 11,
    isActive: true,
    isArchived: false,
    isVisible: true,
    questionCode: 'SEC-KUF001',
    savedAnswers: [],
    selectedAnswerIds: [],
    selectionType: 'single',
    text: 'Which baseline applies?',
    visibilityGroups: [],
    visibilityState: 'visible',
  }
}

describe('SpecificationRequirementSelectionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (
        url ===
          '/api/requirements-specifications/1/requirement-selection-answers' &&
        method === 'GET'
      ) {
        return Promise.resolve(
          okJson({
            questions: [baselineQuestion()],
          }),
        )
      }
      if (
        url ===
          '/api/requirements-specifications/1/requirement-selection-answers/11' &&
        method === 'PUT'
      ) {
        return Promise.resolve(okJson({ questions: [] }))
      }
      throw new Error(`Unmocked fetch: ${method} ${url}`)
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('hides progress while requirement-selection questions are loading', async () => {
    const onChanged = vi.fn()
    let resolveFetch:
      | ((response: { json: () => Promise<unknown>; ok: boolean }) => void)
      | undefined
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<{ json: () => Promise<unknown>; ok: boolean }>(resolve => {
          resolveFetch = resolve
        }),
    )

    render(
      <SpecificationRequirementSelectionPanel
        onChanged={onChanged}
        specificationId={1}
      />,
    )

    expect(screen.getByText('loading')).toBeInTheDocument()
    expect(screen.queryByText('progress: 0/0')).not.toBeInTheDocument()

    await act(async () => {
      resolveFetch?.(okJson({ questions: [baselineQuestion()] }))
    })

    expect(await screen.findByText('progress: 0/1')).toBeInTheDocument()
  })

  it('uses the numeric specification id path segment for loading and saving answers', async () => {
    const onChanged = vi.fn()

    render(
      <SpecificationRequirementSelectionPanel
        onChanged={onChanged}
        specificationId={1}
      />,
    )

    expect(await screen.findByText('Use baseline')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/requirements-specifications/1/requirement-selection-answers',
    )

    fireEvent.click(screen.getByLabelText(/Use baseline/))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements-specifications/1/requirement-selection-answers/11',
        expect.objectContaining({
          method: 'PUT',
        }),
      )
    })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })
})
