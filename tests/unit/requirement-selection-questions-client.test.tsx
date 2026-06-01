import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementSelectionQuestionsClient from '@/app/[locale]/requirements/stewardship/requirement-selection-questions-client'

const helpPanelState = vi.hoisted(() => ({
  useHelpContent: vi.fn(),
}))

vi.mock('@/components/HelpPanel', () => ({
  useHelpContent: helpPanelState.useHelpContent,
}))

vi.mock('next-intl', async () => {
  const messages = ((await import('@/messages/en.json')).default ?? {}) as
    | Record<string, unknown>
    | undefined

  function lookup(path: string): unknown {
    return path.split('.').reduce<unknown>((current, part) => {
      if (current && typeof current === 'object' && part in current) {
        return (current as Record<string, unknown>)[part]
      }
      return undefined
    }, messages)
  }

  return {
    useTranslations: (ns?: string) => (key: string) => {
      const value = lookup(ns ? `${ns}.${key}` : key)
      return typeof value === 'string' ? value : ns ? `${ns}.${key}` : key
    },
  }
})

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const sampleArea = { id: 1, name: 'Security', prefix: 'SEC' }
const samplePackage = { id: 10, isArchived: false, name: 'Baseline' }
const sampleQuestion = {
  answers: [],
  areaId: sampleArea.id,
  areaName: sampleArea.name,
  areaPrefix: sampleArea.prefix,
  helpText: null,
  id: 11,
  isActive: true,
  isArchived: false,
  questionCode: 'SEC-KUF001',
  selectionType: 'single',
  sortOrder: 0,
  text: 'Which security profile applies?',
}

const sampleAnswer = {
  description: null,
  healthState: 'ok',
  id: 101,
  isActive: true,
  isArchived: false,
  isNoRequirementSelection: false,
  matchingRequirementCount: 1,
  matchingRequirements: [
    {
      description: 'Use strong authentication',
      id: 301,
      uniqueId: 'SEC-001',
    },
  ],
  packageIds: [samplePackage.id],
  questionId: sampleQuestion.id,
  requirementIds: [301],
  sortOrder: 0,
  text: 'Baseline profile',
}

describe('RequirementSelectionQuestionsClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-areas') {
        return okJson({ areas: [sampleArea] })
      }
      if (url === '/api/requirement-packages') {
        return okJson({ requirementPackages: [samplePackage] })
      }
      if (url === '/api/requirement-selection-questions?includeArchived=true') {
        return okJson({ questions: [] })
      }
      return okJson({})
    })
  })

  it('registers stewardship help content', async () => {
    render(<RequirementSelectionQuestionsClient />)

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Requirement selection questions',
      }),
    ).toBeInTheDocument()
    expect(helpPanelState.useHelpContent).toHaveBeenCalledWith({
      sections: expect.arrayContaining([
        expect.objectContaining({
          bodyKey: 'requirementSelectionQuestionsStewardship.overview.body',
          headingKey:
            'requirementSelectionQuestionsStewardship.overview.heading',
        }),
      ]),
      titleKey: 'requirementSelectionQuestionsStewardship.title',
    })
  })

  it('opens the new question form from the floating pill modal', async () => {
    render(<RequirementSelectionQuestionsClient />)

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Requirement selection questions',
      }),
    ).toBeInTheDocument()

    const createButton = await screen.findByRole('button', {
      name: 'Create requirement selection question',
    })
    expect(createButton).toHaveAttribute('data-floating-action-id', 'create')

    fireEvent.click(createButton)

    expect(
      screen.getByRole('dialog', {
        name: 'Create requirement selection question',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: /Requirement area/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Text/ })).toBeInTheDocument()
  })

  it('names the stewardship search and filter controls for assistive technology', async () => {
    render(<RequirementSelectionQuestionsClient />)

    expect(
      await screen.findByRole('textbox', {
        name: 'Search question ID or text',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'All requirement areas' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'All statuses' }),
    ).toBeInTheDocument()
  })

  it('shows field help text for question and answer forms', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-areas') {
        return okJson({ areas: [sampleArea] })
      }
      if (url === '/api/requirement-packages') {
        return okJson({ requirementPackages: [samplePackage] })
      }
      if (url === '/api/requirement-selection-questions?includeArchived=true') {
        return okJson({ questions: [sampleQuestion] })
      }
      return okJson({})
    })

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(sampleQuestion.text)).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Help: Requirement IDs',
      }),
    )
    expect(
      screen.getByText(/Only requirements with a published version/),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Create requirement selection question',
      }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Help: Requirement area',
      }),
    )
    expect(
      screen.getByText(/grouped under the same area in the specification/),
    ).toBeInTheDocument()
  })

  it('submits a new question from the modal and closes it', async () => {
    const createdQuestion = { ...sampleQuestion, id: 99, isActive: false }
    let questions: unknown[] = []

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/requirement-areas') {
        return okJson({ areas: [sampleArea] })
      }
      if (url === '/api/requirement-packages') {
        return okJson({ requirementPackages: [samplePackage] })
      }
      if (
        url === '/api/requirement-selection-questions' &&
        init?.method === 'POST'
      ) {
        questions = [createdQuestion]
        return okJson(createdQuestion)
      }
      if (url === '/api/requirement-selection-questions?includeArchived=true') {
        return okJson({ questions })
      }
      return okJson({})
    })

    render(<RequirementSelectionQuestionsClient />)

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Create requirement selection question',
      }),
    )
    fireEvent.change(
      screen.getByRole('combobox', { name: /Requirement area/ }),
      {
        target: { value: String(sampleArea.id) },
      },
    )
    fireEvent.change(screen.getByRole('textbox', { name: /Text/ }), {
      target: { value: createdQuestion.text },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-selection-questions',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByText(createdQuestion.text)).toBeInTheDocument()
  })

  it('selects an answer parent question before saving edited answers', async () => {
    const firstQuestion = {
      ...sampleQuestion,
      questionCode: 'SEC-KUF001',
      text: 'First question',
    }
    const secondQuestion = {
      ...sampleQuestion,
      answers: [
        {
          ...sampleAnswer,
          id: 201,
          questionId: 22,
          text: 'Second answer',
        },
      ],
      id: 22,
      questionCode: 'SEC-KUF002',
      text: 'Second question',
    }
    const questions = [firstQuestion, secondQuestion]

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/requirement-areas') {
        return okJson({ areas: [sampleArea] })
      }
      if (url === '/api/requirement-packages') {
        return okJson({ requirementPackages: [samplePackage] })
      }
      if (url === '/api/requirement-selection-questions?includeArchived=true') {
        return okJson({ questions })
      }
      if (
        url === '/api/requirement-selection-questions/22/answers/201' &&
        init?.method === 'PUT'
      ) {
        return okJson(secondQuestion)
      }
      return okJson({})
    })

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText('Second question')).toBeInTheDocument()
    const editButtons = screen.getAllByRole('button', { name: 'Edit' })
    const answerEditButton = editButtons[editButtons.length - 1]
    if (!answerEditButton) throw new Error('Missing answer edit button')
    fireEvent.click(answerEditButton)

    expect(screen.getByRole('textbox', { name: /^Text/ })).toHaveValue(
      'Second answer',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-selection-questions/22/answers/201',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
  })
})
