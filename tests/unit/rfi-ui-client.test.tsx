import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmModalProvider } from '@/components/ConfirmModal'

vi.mock('next-intl', () => {
  const translators = new Map<string, (key: string) => string>()
  return {
    useLocale: () => 'en',
    useTranslations: (namespace?: string) => {
      const cacheKey = namespace ?? ''
      let translator = translators.get(cacheKey)
      if (!translator) {
        translator = (key: string) => (namespace ? `${namespace}.${key}` : key)
        translators.set(cacheKey, translator)
      }
      return translator
    },
  }
})

const fetchMock = vi.fn()

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}

const areas = [
  {
    id: 1,
    name: 'Security',
    permissions: { canAuthor: true, canManageAssignments: true },
    prefix: 'SEC',
  },
  {
    id: 2,
    name: 'Operations',
    permissions: { canAuthor: true, canManageAssignments: false },
    prefix: 'OPS',
  },
]

const rfiQuestions = [
  {
    archivedAt: null,
    areaId: 1,
    areaName: 'Security',
    areaPrefix: 'SEC',
    expectedAnswerFormat: 'Free text',
    helpText: 'Explain logging controls.',
    id: 11,
    isArchived: false,
    questionCode: 'SEC-RFI001',
    questionText: 'How do you handle logs?',
    sortOrder: 10,
    versionNumber: 1,
  },
  {
    archivedAt: '2026-01-01T00:00:00.000Z',
    areaId: 2,
    areaName: 'Operations',
    areaPrefix: 'OPS',
    expectedAnswerFormat: 'Yes/no',
    helpText: null,
    id: 22,
    isArchived: true,
    questionCode: 'OPS-RFI001',
    questionText: 'Do you offer support hours?',
    sortOrder: 1,
    versionNumber: 2,
  },
]

const rfiSuggestions = [
  {
    areaId: 1,
    areaName: 'Security',
    content: 'Add an area-level question about cloud exit.',
    createdAt: '2026-06-21T09:00:00.000Z',
    createdByDisplayName: 'no-user',
    createdByHsaId: null,
    id: 101,
    isReviewRequested: false,
    questionCode: null,
    resolution: null,
    resolutionMotivation: null,
    resolvedAt: null,
    resolvedByDisplayName: null,
    resolvedByHsaId: null,
    reviewRequestedAt: null,
    rfiQuestionId: null,
    sourceSpecificationName: 'Integration platform procurement',
    sourceSpecificationUniqueId: 'INTPLATT-UPP-2026',
    specificationId: 5,
    updatedAt: '2026-06-21T09:00:00.000Z',
  },
  {
    areaId: 1,
    areaName: 'Security',
    content: 'Clarify log retention.',
    createdAt: '2026-06-21T09:05:00.000Z',
    createdByDisplayName: 'Sam Writer',
    createdByHsaId: 'SE5560000001-sam',
    id: 102,
    isReviewRequested: false,
    questionCode: 'SEC-RFI001',
    resolution: null,
    resolutionMotivation: null,
    resolvedAt: null,
    resolvedByDisplayName: null,
    resolvedByHsaId: null,
    reviewRequestedAt: null,
    rfiQuestionId: 11,
    sourceSpecificationName: 'Integration platform procurement',
    sourceSpecificationUniqueId: 'INTPLATT-UPP-2026',
    specificationId: 5,
    updatedAt: '2026-06-21T09:05:00.000Z',
  },
  {
    areaId: 1,
    areaName: 'Security',
    content: 'Review audit export wording.',
    createdAt: '2026-06-21T09:10:00.000Z',
    createdByDisplayName: 'Rita Reviewer',
    createdByHsaId: 'SE5560000001-rita',
    id: 103,
    isReviewRequested: true,
    questionCode: 'SEC-RFI001',
    resolution: null,
    resolutionMotivation: null,
    resolvedAt: null,
    resolvedByDisplayName: null,
    resolvedByHsaId: null,
    reviewRequestedAt: '2026-06-21T10:00:00.000Z',
    rfiQuestionId: 11,
    sourceSpecificationName: 'Integration platform procurement',
    sourceSpecificationUniqueId: 'INTPLATT-UPP-2026',
    specificationId: 5,
    updatedAt: '2026-06-21T10:00:00.000Z',
  },
  {
    areaId: 1,
    areaName: 'Security',
    content: 'Handled SIEM wording.',
    createdAt: '2026-06-21T08:00:00.000Z',
    createdByDisplayName: 'Ada Admin',
    createdByHsaId: 'SE5560000001-ada',
    id: 104,
    isReviewRequested: true,
    questionCode: 'SEC-RFI001',
    resolution: 1,
    resolutionMotivation: 'Question text was updated.',
    resolvedAt: '2026-06-21T11:00:00.000Z',
    resolvedByDisplayName: 'Rita Reviewer',
    resolvedByHsaId: 'SE5560000001-rita',
    reviewRequestedAt: '2026-06-21T09:00:00.000Z',
    rfiQuestionId: 11,
    sourceSpecificationName: 'Integration platform procurement',
    sourceSpecificationUniqueId: 'INTPLATT-UPP-2026',
    specificationId: 5,
    updatedAt: '2026-06-21T11:00:00.000Z',
  },
  {
    areaId: 2,
    areaName: 'Operations',
    content: 'Clarify support escalation for archived support question.',
    createdAt: '2026-06-21T09:30:00.000Z',
    createdByDisplayName: 'Olivia Operator',
    createdByHsaId: 'SE5560000001-olivia',
    id: 105,
    isReviewRequested: true,
    questionCode: 'OPS-RFI001',
    resolution: null,
    resolutionMotivation: null,
    resolvedAt: null,
    resolvedByDisplayName: null,
    resolvedByHsaId: null,
    reviewRequestedAt: '2026-06-21T10:30:00.000Z',
    rfiQuestionId: 22,
    sourceSpecificationName: 'Operations sourcing',
    sourceSpecificationUniqueId: 'OPS-UPP-2026',
    specificationId: 6,
    updatedAt: '2026-06-21T10:30:00.000Z',
  },
  {
    areaId: 2,
    areaName: 'Operations',
    content: 'Dismissed area suggestion about support calendar.',
    createdAt: '2026-06-21T07:30:00.000Z',
    createdByDisplayName: 'Olivia Operator',
    createdByHsaId: 'SE5560000001-olivia',
    id: 106,
    isReviewRequested: true,
    questionCode: null,
    resolution: 2,
    resolutionMotivation: 'Already covered by an existing question.',
    resolvedAt: '2026-06-21T08:30:00.000Z',
    resolvedByDisplayName: 'Rita Reviewer',
    resolvedByHsaId: 'SE5560000001-rita',
    reviewRequestedAt: '2026-06-21T08:00:00.000Z',
    rfiQuestionId: null,
    sourceSpecificationName: 'Operations sourcing',
    sourceSpecificationUniqueId: 'OPS-UPP-2026',
    specificationId: 6,
    updatedAt: '2026-06-21T08:30:00.000Z',
  },
]

function mockRfiClientFetch(suggestions: unknown[] = []) {
  fetchMock.mockImplementation((url: RequestInfo | URL, init?: RequestInit) => {
    const href = String(url)
    if (href === '/api/requirement-areas') {
      return Promise.resolve(okJson({ areas }))
    }
    if (href === '/api/rfi-questions?includeArchived=true') {
      return Promise.resolve(okJson({ questions: rfiQuestions }))
    }
    if (href === '/api/rfi-question-suggestions') {
      return Promise.resolve(okJson({ suggestions }))
    }
    if (href === '/api/rfi-questions' && init?.method === 'POST') {
      return Promise.resolve(okJson({ id: 33 }))
    }
    if (href === '/api/rfi-questions/11' && init?.method === 'PUT') {
      return Promise.resolve(okJson({ id: 11 }))
    }
    if (
      href === '/api/rfi-question-suggestions/102/request-review' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(okJson({ suggestion: rfiSuggestions[1] }))
    }
    if (
      href === '/api/rfi-question-suggestions/103/resolution' &&
      init?.method === 'POST'
    ) {
      return Promise.resolve(okJson({ suggestion: rfiSuggestions[2] }))
    }
    throw new Error(`Unmocked fetch: ${href}`)
  })
}

async function renderRfiQuestionsClient() {
  const { default: RfiQuestionsClient } = await import(
    '@/app/[locale]/requirements/stewardship/rfi-questions-client'
  )

  render(
    <ConfirmModalProvider>
      <RfiQuestionsClient />
    </ConfirmModalProvider>,
  )
}

describe('RFI client UI states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('leaves loading state when no requirement areas are available', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      const href = String(url)
      if (href === '/api/requirement-areas') {
        return Promise.resolve(okJson({ areas: [] }))
      }
      if (href === '/api/rfi-questions?includeArchived=true') {
        return Promise.resolve(okJson({ questions: [] }))
      }
      if (href === '/api/rfi-question-suggestions') {
        return Promise.resolve(okJson({ suggestions: [] }))
      }
      throw new Error(`Unmocked fetch: ${href}`)
    })

    await renderRfiQuestionsClient()

    await waitFor(() => {
      expect(screen.queryByText('common.loading')).not.toBeInTheDocument()
    })
    expect(screen.getByText('rfiQuestions.emptyQuestions')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock).toHaveBeenCalledWith('/api/requirement-areas')
  })

  it('shows RFI questions with search, area and status filters', async () => {
    mockRfiClientFetch()

    await renderRfiQuestionsClient()

    expect(await screen.findByText('SEC-RFI001')).toBeInTheDocument()
    expect(screen.getByText('OPS-RFI001')).toBeInTheDocument()
    const editButton = screen.getByRole('button', {
      name: 'rfiQuestions.editQuestion: SEC-RFI001',
    })
    const archiveButton = screen.getByRole('button', {
      name: 'rfiQuestions.archive: SEC-RFI001',
    })
    const reactivateButton = screen.getByRole('button', {
      name: 'rfiQuestions.reactivate: OPS-RFI001',
    })

    for (const actionButton of [editButton, archiveButton, reactivateButton]) {
      expect(actionButton.textContent?.trim()).toBe('')
      expect(actionButton.querySelector('svg')).not.toBeNull()
    }
    expect(
      screen.queryByRole('option', { name: 'rfiQuestions.inactive' }),
    ).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('rfiQuestions.search'), 'logs')
    expect(screen.getByText('SEC-RFI001')).toBeInTheDocument()
    expect(screen.queryByText('OPS-RFI001')).not.toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('rfiQuestions.search'))
    await userEvent.selectOptions(
      screen.getByLabelText('rfiQuestions.allAreas'),
      '2',
    )
    expect(screen.queryByText('SEC-RFI001')).not.toBeInTheDocument()
    expect(screen.getByText('OPS-RFI001')).toBeInTheDocument()

    await userEvent.selectOptions(
      screen.getByLabelText('rfiQuestions.allStatuses'),
      'active',
    )
    expect(
      screen.getByText('rfiQuestions.noFilteredQuestions'),
    ).toBeInTheDocument()
  })

  it('handles RFI question suggestions from their area and question indicators', async () => {
    mockRfiClientFetch(rfiSuggestions)

    await renderRfiQuestionsClient()

    const areaWarningButton = await screen.findByRole('button', {
      name: 'rfiQuestions.handleSuggestions: SEC Security',
    })
    expect(areaWarningButton.querySelector('svg')).toHaveClass(
      'lucide-message-square-warning',
    )
    expect(areaWarningButton).toHaveTextContent('1')
    expect(areaWarningButton).toHaveAttribute(
      'data-developer-mode-context',
      'rfiQuestions',
    )
    expect(areaWarningButton).toHaveAttribute(
      'data-developer-mode-name',
      'suggestion indicator',
    )
    expect(areaWarningButton).toHaveAttribute(
      'data-developer-mode-value',
      'area SEC untreated',
    )

    await userEvent.click(areaWarningButton)
    expect(
      screen.getByText('Add an area-level question about cloud exit.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Anonymous/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'common.close' }))

    const questionWarningButton = screen.getByRole('button', {
      name: 'rfiQuestions.handleSuggestions: SEC-RFI001',
    })
    expect(questionWarningButton.querySelector('svg')).toHaveClass(
      'lucide-message-square-warning',
    )
    expect(questionWarningButton).toHaveTextContent('2')

    const handledAreaButton = screen.getByRole('button', {
      name: 'rfiQuestions.viewHandledSuggestions: OPS Operations',
    })
    expect(handledAreaButton.querySelector('svg')).toHaveClass(
      'lucide-message-square-check',
    )
    expect(handledAreaButton).not.toHaveTextContent('1')
    expect(handledAreaButton).toHaveAttribute(
      'data-developer-mode-value',
      'area OPS handled',
    )

    await userEvent.click(questionWarningButton)
    expect(
      screen.getByRole('dialog', {
        name: 'rfiQuestions.handleSuggestions',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('rfiQuestions.newSuggestions')).toBeInTheDocument()
    expect(
      screen.getByText('rfiQuestions.reviewSuggestions'),
    ).toBeInTheDocument()
    expect(screen.getByText('Clarify log retention.')).toBeInTheDocument()
    expect(screen.getByText('Review audit export wording.')).toBeInTheDocument()
    expect(screen.getByText(/Sam Writer/)).toBeInTheDocument()
    expect(screen.getByText(/Rita Reviewer/)).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'rfiQuestions.requestReview' }),
    )
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/rfi-question-suggestions/102/request-review',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    const motivationInputs = screen.getAllByLabelText(
      /rfiQuestions\.resolutionMotivation/,
    )
    await userEvent.type(motivationInputs[1], 'Handled after review.')
    await userEvent.click(
      screen.getAllByRole('button', {
        name: 'rfiQuestions.markResolved',
      })[1],
    )
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/rfi-question-suggestions/103/resolution',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    const resolveCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === '/api/rfi-question-suggestions/103/resolution' &&
        init?.method === 'POST',
    )
    expect(JSON.parse(String(resolveCall?.[1]?.body))).toEqual({
      resolution: 'resolved',
      resolutionMotivation: 'Handled after review.',
    })
  })

  it('filters to untreated suggestions and keeps archived questions visible', async () => {
    mockRfiClientFetch(rfiSuggestions)

    await renderRfiQuestionsClient()

    expect(await screen.findByText('SEC-RFI001')).toBeInTheDocument()
    expect(screen.getByText('OPS-RFI001')).toBeInTheDocument()

    await userEvent.selectOptions(
      screen.getByLabelText('rfiQuestions.allStatuses'),
      'active',
    )
    expect(screen.queryByText('OPS-RFI001')).not.toBeInTheDocument()

    await userEvent.selectOptions(
      screen.getByLabelText('rfiQuestions.suggestionFilter'),
      'unresolved',
    )
    expect(screen.getByText('SEC-RFI001')).toBeInTheDocument()
    expect(screen.getByText('OPS-RFI001')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('rfiQuestions.search'))
    await userEvent.type(
      screen.getByLabelText('rfiQuestions.search'),
      'cloud exit',
    )
    expect(screen.getAllByText('Security').length).toBeGreaterThan(0)
    expect(screen.queryByText('OPS-RFI001')).not.toBeInTheDocument()
  })

  it('creates an RFI question from the modal without exposing sort order', async () => {
    mockRfiClientFetch()

    await renderRfiQuestionsClient()
    await screen.findByText('SEC-RFI001')

    await userEvent.click(
      screen.getByRole('button', { name: 'rfiQuestions.newQuestion' }),
    )
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /rfiQuestions\.area/ }),
      '2',
    )
    await userEvent.type(
      screen.getByRole('textbox', { name: /rfiQuestions\.questionText/ }),
      'Can you describe support coverage?',
    )
    await userEvent.type(
      screen.getByLabelText('rfiQuestions.expectedAnswerFormat'),
      'Short text',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'rfiQuestions.saveQuestion' }),
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/rfi-questions',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === '/api/rfi-questions' && init?.method === 'POST',
    )
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      areaId: 2,
      expectedAnswerFormat: 'Short text',
      helpText: null,
      questionText: 'Can you describe support coverage?',
    })
  })

  it('limits RFI question authoring controls to assigned requirement areas', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      const href = String(url)
      if (href === '/api/requirement-areas') {
        return Promise.resolve(
          okJson({
            areas: [
              areas[0],
              {
                ...areas[1],
                permissions: {
                  canAuthor: false,
                  canManageAssignments: false,
                },
              },
            ],
          }),
        )
      }
      if (href === '/api/rfi-questions?includeArchived=true') {
        return Promise.resolve(okJson({ questions: rfiQuestions }))
      }
      if (href === '/api/rfi-question-suggestions') {
        return Promise.resolve(okJson({ suggestions: [] }))
      }
      throw new Error(`Unmocked fetch: ${href}`)
    })

    await renderRfiQuestionsClient()

    expect(await screen.findByText('SEC-RFI001')).toBeInTheDocument()
    expect(screen.getByText('OPS-RFI001')).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'rfiQuestions.editQuestion: SEC-RFI001',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: 'rfiQuestions.reactivate: OPS-RFI001',
      }),
    ).not.toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'rfiQuestions.newQuestion' }),
    )

    const areaSelect = screen.getByRole('combobox', {
      name: /rfiQuestions\.area/,
    })
    expect(
      within(areaSelect).getByRole('option', { name: 'SEC Security' }),
    ).toBeInTheDocument()
    expect(
      within(areaSelect).queryByRole('option', { name: 'OPS Operations' }),
    ).not.toBeInTheDocument()
  })

  it('edits an RFI question without sending area or sort order changes', async () => {
    mockRfiClientFetch()

    await renderRfiQuestionsClient()
    await screen.findByText('SEC-RFI001')

    await userEvent.click(
      screen.getByRole('button', {
        name: 'rfiQuestions.editQuestion: SEC-RFI001',
      }),
    )
    expect(
      screen.getByRole('combobox', { name: /rfiQuestions\.area/ }),
    ).toBeDisabled()

    await userEvent.clear(
      screen.getByRole('textbox', { name: /rfiQuestions\.questionText/ }),
    )
    await userEvent.type(
      screen.getByRole('textbox', { name: /rfiQuestions\.questionText/ }),
      'How are logs retained?',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'rfiQuestions.saveQuestion' }),
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/rfi-questions/11',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    const updateCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === '/api/rfi-questions/11' && init?.method === 'PUT',
    )
    expect(JSON.parse(String(updateCall?.[1]?.body))).toEqual({
      expectedAnswerFormat: 'Free text',
      helpText: 'Explain logging controls.',
      questionText: 'How are logs retained?',
    })
  })

  it('creates and reviews contextual RFI question suggestions from the list', async () => {
    const rfiList = {
      isLocked: false,
      items: [
        {
          areaId: 1,
          areaName: 'Security',
          expectedAnswerFormat: 'Free text',
          helpText: null,
          isIncluded: true,
          isVersionStale: false,
          questionCode: 'SEC-RFI001',
          questionId: 11,
          questionText: 'How do you handle logs?',
          relevance: null,
          versionNumber: 1,
        },
      ],
      lockedAt: null,
      lockedByDisplayName: null,
      specificationId: 5,
    }
    const initialSuggestions = [
      {
        areaId: 1,
        content: 'Clarify log retention.',
        id: 90,
        isReviewRequested: false,
        resolution: null,
        rfiQuestionId: 11,
        specificationId: 5,
      },
      {
        areaId: 1,
        content: 'Ask for exported audit reports.',
        id: 91,
        isReviewRequested: true,
        resolution: null,
        rfiQuestionId: 11,
        specificationId: 5,
      },
      {
        areaId: 1,
        content: 'Handled SIEM wording.',
        id: 92,
        isReviewRequested: true,
        resolution: 1,
        rfiQuestionId: 11,
        specificationId: 5,
      },
    ]
    fetchMock.mockImplementation(
      (url: RequestInfo | URL, init?: RequestInit) => {
        const href = String(url)
        if (href === '/api/requirements-specifications/SPEC-1/rfi-list') {
          return Promise.resolve(okJson({ list: rfiList }))
        }
        if (
          href === '/api/rfi-question-suggestions?areaId=1&specificationId=5'
        ) {
          return Promise.resolve(okJson({ suggestions: initialSuggestions }))
        }
        if (
          href === '/api/rfi-question-suggestions' &&
          init?.method === 'POST'
        ) {
          return Promise.resolve(
            okJson({
              suggestion: {
                areaId: 1,
                content: 'Add a question about log exports.',
                id: 93,
                isReviewRequested: false,
                resolution: null,
                rfiQuestionId: 11,
                specificationId: 5,
              },
            }),
          )
        }
        if (
          href === '/api/rfi-question-suggestions/90' &&
          init?.method === 'DELETE'
        ) {
          return Promise.resolve(okJson({ ok: true }))
        }
        throw new Error(`Unmocked fetch: ${href}`)
      },
    )
    const { default: SpecificationRfiListPanel } = await import(
      '@/app/[locale]/specifications/[slug]/specification-rfi-list-panel'
    )

    render(
      <ConfirmModalProvider>
        <SpecificationRfiListPanel
          canEdit
          specificationId={5}
          specificationSlug="SPEC-1"
        />
      </ConfirmModalProvider>,
    )

    const createButton = await screen.findByRole('button', {
      name: 'specificationRfiList.createSuggestionForQuestion',
    })
    expect(createButton.querySelector('svg')).toHaveClass(
      'lucide-message-circle-reply',
    )

    const viewButton = await screen.findByRole('button', {
      name: 'specificationRfiList.viewQuestionSuggestions',
    })
    expect(viewButton).toHaveTextContent('3')
    await userEvent.click(viewButton)
    expect(screen.getByText('Clarify log retention.')).toBeInTheDocument()
    expect(
      screen.getByText('Ask for exported audit reports.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Handled SIEM wording.')).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', {
        name: 'specificationRfiList.deleteSuggestionAriaLabel',
      }),
    ).toHaveLength(1)
    await userEvent.click(
      screen.getByRole('button', {
        name: 'specificationRfiList.deleteSuggestionAriaLabel',
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'common.delete' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/rfi-question-suggestions/90',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
    expect(screen.queryByText('Clarify log retention.')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'common.close' }))
    await userEvent.click(createButton)
    expect(
      screen.getByText('specificationRfiList.suggestionRecipientHint'),
    ).toBeInTheDocument()
    await userEvent.type(
      screen.getByRole('textbox', {
        name: /specificationRfiList\.suggestionContent/,
      }),
      'Add a question about log exports.',
    )
    await userEvent.click(
      screen.getByRole('button', {
        name: 'specificationRfiList.createSuggestion',
      }),
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/rfi-question-suggestions',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === '/api/rfi-question-suggestions' &&
        init?.method === 'POST',
    )
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      areaId: 1,
      content: 'Add a question about log exports.',
      rfiQuestionId: 11,
      specificationId: 5,
    })
    expect(
      screen.getByText('specificationRfiList.suggestionCreated'),
    ).toBeInTheDocument()
  })

  it('updates and filters RFI-list scope with area and question switches', async () => {
    const initialList = {
      isLocked: false,
      items: [
        {
          areaId: 1,
          areaName: 'Security',
          expectedAnswerFormat: 'Free text',
          helpText: 'Explain logging controls.',
          isIncluded: true,
          isVersionStale: false,
          questionCode: 'SEC-RFI001',
          questionId: 11,
          questionText: 'How do you handle logs?',
          relevance: null,
          versionNumber: 1,
        },
        {
          areaId: 1,
          areaName: 'Security',
          expectedAnswerFormat: 'Yes/no',
          helpText: null,
          isIncluded: false,
          isVersionStale: false,
          questionCode: 'SEC-RFI002',
          questionId: 12,
          questionText: 'How do you handle access reviews?',
          relevance: null,
          versionNumber: 1,
        },
        {
          areaId: 2,
          areaName: 'Operations',
          expectedAnswerFormat: 'Yes/no',
          helpText: null,
          isIncluded: false,
          isVersionStale: false,
          questionCode: 'OPS-RFI001',
          questionId: 22,
          questionText: 'Do you offer support hours?',
          relevance: null,
          versionNumber: 1,
        },
      ],
      lockedAt: null,
      lockedByDisplayName: null,
      specificationId: 5,
    }
    const updatedList = {
      ...initialList,
      items: initialList.items.map(item =>
        item.areaId === 1 ? { ...item, isIncluded: true } : item,
      ),
    }

    fetchMock.mockImplementation(
      (url: RequestInfo | URL, init?: RequestInit) => {
        const href = String(url)
        if (href === '/api/requirements-specifications/SPEC-1/rfi-list') {
          return Promise.resolve(okJson({ list: initialList }))
        }
        if (
          href === '/api/rfi-question-suggestions?areaId=1&specificationId=5' ||
          href === '/api/rfi-question-suggestions?areaId=2&specificationId=5'
        ) {
          return Promise.resolve(okJson({ suggestions: [] }))
        }
        if (
          href === '/api/requirements-specifications/SPEC-1/rfi-list/areas/1' &&
          init?.method === 'PATCH'
        ) {
          return Promise.resolve(okJson({ list: updatedList }))
        }
        throw new Error(`Unmocked fetch: ${href}`)
      },
    )
    const { default: SpecificationRfiListPanel } = await import(
      '@/app/[locale]/specifications/[slug]/specification-rfi-list-panel'
    )

    render(
      <ConfirmModalProvider>
        <SpecificationRfiListPanel
          canEdit
          specificationId={5}
          specificationSlug="SPEC-1"
        />
      </ConfirmModalProvider>,
    )

    const securitySection = await screen.findByRole('region', {
      name: 'Security',
    })
    expect(
      within(securitySection).getByText('specificationRfiList.partial'),
    ).toBeInTheDocument()
    const areaScopeSwitch = within(securitySection).getByRole('switch', {
      name: 'specificationRfiList.areaIncludedToggleAria',
    })
    expect(areaScopeSwitch).toHaveAttribute(
      'title',
      'specificationRfiList.partiallyIncluded',
    )
    expect(
      within(securitySection).getAllByRole('switch', {
        name: 'specificationRfiList.questionIncludedToggleAria',
      }),
    ).toHaveLength(2)
    const questionScopeSwitches = within(securitySection).getAllByRole(
      'switch',
      {
        name: 'specificationRfiList.questionIncludedToggleAria',
      },
    )
    expect(questionScopeSwitches[0]).toHaveAttribute(
      'title',
      'specificationRfiList.included',
    )
    expect(questionScopeSwitches[1]).toHaveAttribute(
      'title',
      'specificationRfiList.notIncluded',
    )
    expect(questionScopeSwitches[0]).not.toHaveTextContent(
      'specificationRfiList.included',
    )
    expect(
      within(securitySection).queryByRole('checkbox', {
        name: 'specificationRfiList.included',
      }),
    ).not.toBeInTheDocument()
    expect(
      within(securitySection).getByText('How do you handle access reviews?'),
    ).toHaveClass('opacity-55')

    await userEvent.click(areaScopeSwitch)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements-specifications/SPEC-1/rfi-list/areas/1',
        expect.objectContaining({ method: 'PATCH' }),
      )
    })
    const areaUpdateCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) ===
          '/api/requirements-specifications/SPEC-1/rfi-list/areas/1' &&
        init?.method === 'PATCH',
    )
    expect(JSON.parse(String(areaUpdateCall?.[1]?.body))).toEqual({
      isIncluded: true,
    })
    await waitFor(() => {
      expect(
        within(securitySection).getByRole('switch', {
          name: 'specificationRfiList.areaIncludedToggleAria',
        }),
      ).toHaveAttribute('aria-checked', 'true')
    })

    await userEvent.click(
      screen.getByRole('button', {
        name: 'specificationRfiList.showIncludedOnly',
      }),
    )
    expect(
      screen.getByRole('button', {
        name: 'specificationRfiList.showingIncludedOnly',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.queryByText('Do you offer support hours?'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/hidden/iu)).not.toBeInTheDocument()
  })

  it('shows the RFI-list lock toggle as an unlocked or locked state', async () => {
    const unlockedList = {
      isLocked: false,
      items: [
        {
          areaId: 1,
          areaName: 'Security',
          expectedAnswerFormat: 'Free text',
          helpText: null,
          isIncluded: true,
          isVersionStale: false,
          questionCode: 'SEC-RFI001',
          questionId: 11,
          questionText: 'How do you handle logs?',
          relevance: null,
          versionNumber: 1,
        },
      ],
      lockedAt: null,
      lockedByDisplayName: null,
      specificationId: 5,
    }
    const lockedList = {
      ...unlockedList,
      isLocked: true,
      lockedAt: '2026-06-21T10:00:00.000Z',
    }

    fetchMock.mockImplementation(
      (url: RequestInfo | URL, init?: RequestInit) => {
        const href = String(url)
        if (href === '/api/requirements-specifications/SPEC-1/rfi-list') {
          return Promise.resolve(okJson({ list: unlockedList }))
        }
        if (
          href === '/api/rfi-question-suggestions?areaId=1&specificationId=5'
        ) {
          return Promise.resolve(okJson({ suggestions: [] }))
        }
        if (
          href === '/api/requirements-specifications/SPEC-1/rfi-list/lock' &&
          init?.method === 'POST'
        ) {
          return Promise.resolve(okJson({ list: lockedList }))
        }
        throw new Error(`Unmocked fetch: ${href}`)
      },
    )
    const { default: SpecificationRfiListPanel } = await import(
      '@/app/[locale]/specifications/[slug]/specification-rfi-list-panel'
    )

    render(
      <ConfirmModalProvider>
        <SpecificationRfiListPanel
          canEdit
          specificationId={5}
          specificationSlug="SPEC-1"
        />
      </ConfirmModalProvider>,
    )

    const unlockedButton = await screen.findByRole('switch', {
      name: 'specificationRfiList.lockedToggleAria',
    })
    const csvLink = screen.getByRole('link', { name: 'CSV' })
    const pdfLink = screen.getByRole('link', { name: 'PDF' })
    for (const exportLink of [csvLink, pdfLink]) {
      expect(exportLink).toHaveClass('h-11', 'w-11', 'rounded-full')
      expect(exportLink.querySelector('span')).toHaveClass('sr-only')
    }
    expect(csvLink.querySelector('svg')).toHaveClass('lucide-download')
    expect(pdfLink.querySelector('svg')).toHaveClass('lucide-printer')

    expect(unlockedButton).toHaveAttribute('aria-checked', 'false')
    expect(unlockedButton).toHaveAttribute('title', 'specificationRfiList.lock')
    expect(unlockedButton).toHaveTextContent(
      'specificationRfiList.lockedToggleLabel',
    )
    expect(unlockedButton).not.toHaveTextContent('common.no')
    expect(unlockedButton).not.toHaveTextContent('common.yes')
    expect(unlockedButton.className).not.toContain('border-')
    expect(unlockedButton.className).not.toContain('bg-')
    expect(unlockedButton.querySelector('svg')).toBeNull()
    const unlockedTrack = unlockedButton.querySelector('span:nth-child(2)')
    expect(unlockedTrack).toHaveClass('h-5', 'w-9', 'bg-secondary-300')

    await userEvent.click(unlockedButton)

    const lockedButton = await screen.findByRole('switch', {
      name: 'specificationRfiList.lockedToggleAria',
    })
    expect(lockedButton).toHaveAttribute('aria-checked', 'true')
    expect(lockedButton).toHaveAttribute('title', 'specificationRfiList.unlock')
    expect(lockedButton).not.toHaveTextContent('common.no')
    expect(lockedButton).not.toHaveTextContent('common.yes')
    expect(lockedButton.className).not.toContain('border-')
    expect(lockedButton.className).not.toContain('bg-')
    expect(lockedButton.querySelector('svg')).toBeNull()
    const lockedTrack = lockedButton.querySelector('span:nth-child(2)')
    expect(lockedTrack).toHaveClass('h-5', 'w-9', 'bg-amber-700')
  })
})
