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

const confirmMock = vi.hoisted(() => vi.fn())

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({
    confirm: confirmMock,
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

function workflowQuestions() {
  const parent = {
    ...baselineQuestion(),
    answers: [
      {
        alreadyAddedRequirementCount: 1,
        description: 'Encryption controls',
        id: 101,
        isActive: true,
        isArchived: false,
        isNoRequirementSelection: false,
        matchingRequirementCount: 2,
        text: 'Use baseline',
      },
      {
        description: null,
        healthState: 'missing_requirement_selection' as const,
        id: 102,
        isActive: true,
        isArchived: false,
        isNoRequirementSelection: false,
        text: 'Use extended controls',
      },
      {
        description: null,
        id: 103,
        isActive: true,
        isArchived: false,
        isNoRequirementSelection: true,
        text: 'No controls',
      },
    ],
    savedAnswers: [{ answerId: 101, isHistorical: false }],
    selectedAnswerIds: [101],
    selectionType: 'multiple' as const,
  }
  const child = {
    ...baselineQuestion(),
    areaName: 'Privacy',
    id: 12,
    questionCode: 'PRI-KUF001',
    text: 'Which follow-up applies?',
    visibilityGroups: [
      {
        conditions: [
          {
            answerId: 101,
            answerIsActive: true,
            answerIsArchived: false,
            parentQuestionId: 11,
            parentQuestionIsActive: true,
            parentQuestionIsArchived: false,
          },
        ],
        id: 1,
      },
    ],
  }
  const historical = {
    ...baselineQuestion(),
    areaName: 'Privacy',
    id: 13,
    isVisible: false,
    questionCode: 'PRI-KUF002',
    savedAnswers: [{ answerId: 101, isHistorical: true }],
    text: 'Historical follow-up',
    visibilityState: 'hidden_with_historical_answers' as const,
  }
  const hidden = {
    ...baselineQuestion(),
    id: 14,
    isVisible: false,
    questionCode: 'SEC-KUF003',
    text: 'Hidden question',
    visibilityState: 'hidden' as const,
  }
  return [parent, child, historical, hidden]
}

describe('SpecificationRequirementSelectionPanel', () => {
  let scrollIntoViewDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'scrollIntoView',
    )
    vi.clearAllMocks()
    confirmMock.mockResolvedValue(true)
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
    vi.restoreAllMocks()
    if (scrollIntoViewDescriptor) {
      Object.defineProperty(
        Element.prototype,
        'scrollIntoView',
        scrollIntoViewDescriptor,
      )
    } else {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
    }
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

    const unansweredOnly = screen.getByRole('checkbox', {
      name: 'unansweredOnly',
    })
    expect(unansweredOnly).toHaveClass('h-4', 'w-4')
    expect(unansweredOnly).not.toHaveClass('min-h-6', 'min-w-6')
    expect(unansweredOnly.parentElement).toHaveClass('min-h-10')

    const answer = screen.getByLabelText(/Use baseline/)
    expect(answer).toHaveClass('h-4', 'w-4')
    expect(answer).not.toHaveClass('min-h-6', 'min-w-6')
    expect(answer.parentElement).toHaveClass('min-h-10')
    fireEvent.click(answer)

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

  it('filters, groups, and links the complete visible question workflow', async () => {
    if (!scrollIntoViewDescriptor) {
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        configurable: true,
        value: () => undefined,
        writable: true,
      })
    }
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined)
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve(okJson({ questions: workflowQuestions() }))
      }
      return Promise.resolve(okJson({ questions: workflowQuestions() }))
    })

    render(
      <SpecificationRequirementSelectionPanel
        onChanged={vi.fn()}
        specificationId={1}
      />,
    )

    expect(await screen.findByText('progress: 1/2')).toBeInTheDocument()
    expect(screen.getByText('Security: 1/1')).toBeInTheDocument()
    expect(screen.getByText('Privacy: 0/1')).toBeInTheDocument()
    expect(screen.queryByText('Hidden question')).not.toBeInTheDocument()
    expect(screen.getByText('hiddenHistoricalVisibility')).toBeInTheDocument()
    expect(screen.getByText('missingRequirementSelection')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'PRI-KUF001' }))
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    })

    fireEvent.change(screen.getByPlaceholderText('search'), {
      target: { value: 'follow-up' },
    })
    expect(
      screen.queryByText('Which baseline applies?'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Which follow-up applies?')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('search'), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Security' },
    })
    expect(screen.getByText('Which baseline applies?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'unansweredOnly' }))
    expect(screen.getByText('noQuestions')).toBeInTheDocument()
  })

  it('handles multiple-choice selection, deselection, no-selection, and clear actions', async () => {
    const onChanged = vi.fn()
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve(okJson({ questions: workflowQuestions() }))
      }
      return Promise.resolve(okJson({ questions: workflowQuestions() }))
    })
    render(
      <SpecificationRequirementSelectionPanel
        onChanged={onChanged}
        specificationId={1}
      />,
    )

    const baseline = await screen.findByRole('checkbox', {
      name: /Use baseline/,
    })
    const extended = screen.getByRole('checkbox', {
      name: /Use extended controls/,
    })
    const none = screen.getByRole('checkbox', { name: /No controls/ })

    fireEvent.click(extended)
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([, init]) => init?.method === 'PUT',
      )
      expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({
        answerIds: [101, 102],
      })
    })

    fireEvent.click(baseline)
    await waitFor(() => {
      const puts = fetchMock.mock.calls.filter(
        ([, init]) => init?.method === 'PUT',
      )
      expect(
        puts.some(([, init]) =>
          JSON.stringify(JSON.parse(String(init?.body)).answerIds).includes(
            '[]',
          ),
        ),
      ).toBe(true)
    })

    fireEvent.click(none)
    await waitFor(() => {
      const puts = fetchMock.mock.calls.filter(
        ([, init]) => init?.method === 'PUT',
      )
      expect(
        puts.some(([, init]) =>
          JSON.stringify(JSON.parse(String(init?.body)).answerIds).includes(
            '[103]',
          ),
        ),
      ).toBe(true)
    })

    fireEvent.click(screen.getAllByRole('button', { name: 'clear' })[0])
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('confirms and retries an answer change that hides answered follow-ups', async () => {
    let putCount = 0
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        putCount += 1
        if (putCount === 1) {
          return Promise.resolve({
            json: async () => ({
              hiddenSelections: [
                {
                  answerTexts: ['Stored answer'],
                  questionCode: 'PRI-KUF001',
                  questionId: 12,
                  questionText: 'Which follow-up applies?',
                },
              ],
            }),
            ok: false,
            status: 409,
          })
        }
        return Promise.resolve(okJson({ questions: workflowQuestions() }))
      }
      return Promise.resolve(okJson({ questions: workflowQuestions() }))
    })

    render(
      <SpecificationRequirementSelectionPanel
        onChanged={vi.fn()}
        specificationId={1}
      />,
    )
    fireEvent.click(
      await screen.findByRole('checkbox', { name: /Use extended controls/ }),
    )

    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(putCount).toBe(2))
    const retryBody = JSON.parse(
      String(
        fetchMock.mock.calls.filter(
          ([, init]) => init?.method === 'PUT',
        )[1]?.[1]?.body,
      ),
    )
    expect(retryBody.confirmHiddenAnswerClear).toBe(true)
  })

  it('restores the previous answers when hidden-answer confirmation is cancelled', async () => {
    confirmMock.mockResolvedValueOnce(false)
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve({
          json: async () => ({}),
          ok: false,
          status: 409,
        })
      }
      return Promise.resolve(okJson({ questions: workflowQuestions() }))
    })

    render(
      <SpecificationRequirementSelectionPanel
        onChanged={vi.fn()}
        specificationId={1}
      />,
    )
    const extended = await screen.findByRole('checkbox', {
      name: /Use extended controls/,
    })
    fireEvent.click(extended)

    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('checkbox', { name: /Use baseline/ })).toBeChecked()
  })

  it.each([
    {
      fetchResult: () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'Selection unavailable' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500,
          }),
        ),
      message: 'Selection unavailable',
      name: 'server error',
    },
    {
      fetchResult: () => Promise.reject(new Error('network down')),
      message: 'error',
      name: 'network error',
    },
  ])(
    'shows a safe $name while loading questions',
    async ({ fetchResult, message }) => {
      fetchMock.mockImplementation(fetchResult)
      render(
        <SpecificationRequirementSelectionPanel
          onChanged={vi.fn()}
          specificationId={1}
        />,
      )

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(screen.getByText('noQuestions')).toBeInTheDocument()
    },
  )

  it('restores answers and shows the server error when saving fails', async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'Save rejected' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 400,
          }),
        )
      }
      return Promise.resolve(okJson({ questions: [baselineQuestion()] }))
    })
    render(
      <SpecificationRequirementSelectionPanel
        onChanged={vi.fn()}
        specificationId={1}
      />,
    )

    fireEvent.click(await screen.findByLabelText(/Use baseline/))
    expect(await screen.findByRole('alert')).toHaveTextContent('Save rejected')
    expect(screen.getByLabelText(/Use baseline/)).not.toBeChecked()
  })

  it('restores answers and shows a safe error when saving throws', async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT')
        return Promise.reject(new Error('network down'))
      return Promise.resolve(okJson({ questions: [baselineQuestion()] }))
    })
    render(
      <SpecificationRequirementSelectionPanel
        onChanged={vi.fn()}
        specificationId={1}
      />,
    )

    fireEvent.click(await screen.findByLabelText(/Use baseline/))
    expect(await screen.findByRole('alert')).toHaveTextContent('error')
  })
})
