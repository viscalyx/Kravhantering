import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
  { id: 1, name: 'Security', prefix: 'SEC' },
  { id: 2, name: 'Operations', prefix: 'OPS' },
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

function mockRfiClientFetch() {
  fetchMock.mockImplementation((url: RequestInfo | URL, init?: RequestInit) => {
    const href = String(url)
    if (href === '/api/requirement-areas') {
      return Promise.resolve(okJson({ areas }))
    }
    if (href === '/api/rfi-questions?includeArchived=true') {
      return Promise.resolve(okJson({ questions: rfiQuestions }))
    }
    if (href === '/api/rfi-question-suggestions') {
      return Promise.resolve(okJson({ suggestions: [] }))
    }
    if (href === '/api/rfi-questions' && init?.method === 'POST') {
      return Promise.resolve(okJson({ id: 33 }))
    }
    if (href === '/api/rfi-questions/11' && init?.method === 'PUT') {
      return Promise.resolve(okJson({ id: 11 }))
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
      expect(actionButton.className).toContain('h-11')
      expect(actionButton.className).toContain('w-11')
      expect(actionButton.className).toContain('rounded-full')
      expect(actionButton.querySelector('svg')).not.toBeNull()
    }
    expect(editButton.className).toContain('text-primary-700')
    expect(archiveButton.className).toContain('text-secondary-700')
    expect(reactivateButton.className).toContain('text-secondary-700')
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

  it('keeps RFI suggestion submit disabled when no suggestion area exists', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      if (String(url) === '/api/requirements-specifications/SPEC-1/rfi-list') {
        return Promise.resolve(
          okJson({
            list: {
              isLocked: false,
              items: [],
              lockedAt: null,
              lockedByDisplayName: null,
              specificationId: 5,
            },
          }),
        )
      }
      throw new Error(`Unmocked fetch: ${String(url)}`)
    })
    const { default: SpecificationRfiListPanel } = await import(
      '@/app/[locale]/specifications/[slug]/specification-rfi-list-panel'
    )

    render(
      <SpecificationRfiListPanel
        canEdit
        specificationId={5}
        specificationSlug="SPEC-1"
      />,
    )

    const button = await screen.findByRole('button', {
      name: 'specificationRfiList.createSuggestion',
    })
    await userEvent.type(
      screen.getByLabelText('specificationRfiList.suggestionContent'),
      'Suggest a logging question',
    )

    expect(button).toBeDisabled()
  })
})
