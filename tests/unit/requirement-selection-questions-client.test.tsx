import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementSelectionQuestionsClient from '@/app/[locale]/requirements/stewardship/requirement-selection-questions-client'

const confirmState = vi.hoisted(() => ({
  confirm: vi.fn(),
}))

const helpPanelState = vi.hoisted(() => ({
  useHelpContent: vi.fn(),
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: confirmState.confirm }),
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
    useLocale: () => 'en',
    useTranslations: (ns?: string) => (key: string) => {
      const value = lookup(ns ? `${ns}.${key}` : key)
      return typeof value === 'string' ? value : ns ? `${ns}.${key}` : key
    },
  }
})

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

function mockScrollMetrics(
  element: HTMLElement,
  metrics: { clientHeight: number; scrollHeight: number; scrollTop?: number },
) {
  let scrollTop = metrics.scrollTop ?? 0
  Object.defineProperties(element, {
    clientHeight: {
      configurable: true,
      get: () => metrics.clientHeight,
    },
    scrollHeight: {
      configurable: true,
      get: () => metrics.scrollHeight,
    },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: value => {
        scrollTop = Number(value)
      },
    },
  })
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

interface TestAnswer {
  description: string | null
  healthState: 'missing_requirement_selection' | 'ok'
  id: number
  isActive: boolean
  isArchived: boolean
  isNoRequirementSelection: boolean
  matchingRequirementCount: number
  matchingRequirements: Array<{
    description: string | null
    direct: boolean
    id: number
    sourcePackages: Array<{ id: number; name: string }>
    uniqueId: string
  }>
  packageIds: number[]
  questionId: number
  requirementIds: number[]
  sortOrder: number
  text: string
}

interface TestQuestion {
  answers: TestAnswer[]
  areaId: number
  areaName: string
  areaPrefix: string
  helpText: string | null
  id: number
  isActive: boolean
  isArchived: boolean
  questionCode: string
  selectionType: 'multiple' | 'single'
  sortOrder: number
  text: string
  visibilityGroups: unknown[]
}

const sampleArea = {
  description: 'Controls authentication and authorization requirements.',
  id: 1,
  name: 'Security',
  prefix: 'SEC',
}
const samplePackage = { id: 10, isArchived: false, name: 'Baseline' }
const secondPackage = { id: 20, isArchived: false, name: 'Enhanced' }
const sampleQuestion: TestQuestion = {
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
  visibilityGroups: [],
}

const sampleAnswer: TestAnswer = {
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
      direct: true,
      id: 301,
      sourcePackages: [{ id: samplePackage.id, name: samplePackage.name }],
      uniqueId: 'SEC-001',
    },
  ],
  packageIds: [samplePackage.id],
  questionId: sampleQuestion.id,
  requirementIds: [301],
  sortOrder: 0,
  text: 'Baseline profile',
}

function sampleRequirementDetail() {
  return {
    area: {
      id: sampleArea.id,
      name: sampleArea.name,
      ownerId: null,
      ownerName: null,
      prefix: sampleArea.prefix,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 301,
    isArchived: false,
    specificationCount: 2,
    uniqueId: 'SEC-001',
    versions: [
      {
        acceptanceCriteria: 'Acceptance detail',
        archivedAt: null,
        archiveInitiatedAt: null,
        category: { id: 1, nameEn: 'Business', nameSv: 'Verksamhet' },
        createdAt: '2026-01-01T00:00:00.000Z',
        createdBy: null,
        description: 'Detailed published requirement',
        editedAt: null,
        id: 401,
        ownerName: null,
        publishedAt: '2026-01-02T00:00:00.000Z',
        qualityCharacteristic: null,
        requiresTesting: false,
        revisionToken: 'revision-token',
        riskLevel: null,
        status: 3,
        statusColor: '#22c55e',
        statusIconName: 'CheckCircle2',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        type: null,
        verificationMethod: null,
        versionNormReferences: [],
        versionNumber: 1,
        versionRequirementPackages: [
          {
            requirementPackage: {
              id: samplePackage.id,
              name: samplePackage.name,
            },
          },
        ],
      },
    ],
  }
}

function createDragDataTransfer(): DataTransfer {
  const data = new Map<string, string>()
  return {
    dropEffect: 'move',
    effectAllowed: 'move',
    getData: vi.fn((format: string) => data.get(format) ?? ''),
    setDragImage: vi.fn(),
    setData: vi.fn((format: string, value: string) => {
      data.set(format, value)
    }),
  } as unknown as DataTransfer
}

function countQuestionListFetches() {
  return fetchMock.mock.calls.filter(
    ([url]) =>
      url === '/api/requirement-selection-questions?includeArchived=true',
  ).length
}

async function flushAsyncWork() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

function getQuestionDisclosure(questionText: string): HTMLButtonElement {
  const disclosure =
    screen
      .getAllByText(questionText)
      .map(element => element.closest('button'))
      .find(
        (button): button is HTMLButtonElement =>
          button instanceof HTMLButtonElement &&
          button.dataset.developerModeName === 'question disclosure',
      ) ?? null
  if (!(disclosure instanceof HTMLButtonElement)) {
    throw new Error(`Missing question disclosure for ${questionText}`)
  }
  return disclosure
}

function getQuestionCard(questionText: string): HTMLElement {
  const card = getQuestionDisclosure(questionText).parentElement?.parentElement
  if (!(card instanceof HTMLElement)) {
    throw new Error(`Missing question card for ${questionText}`)
  }
  return card
}

function expandQuestion(questionText: string): HTMLElement {
  const disclosure = getQuestionDisclosure(questionText)
  if (disclosure.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(disclosure)
  }
  return getQuestionCard(questionText)
}

function getAnswerCard(answerText: string): HTMLElement {
  const answerCard = screen.getByText(answerText).closest('.p-3')
  if (!(answerCard instanceof HTMLElement)) {
    throw new Error(`Missing answer card for ${answerText}`)
  }
  return answerCard
}

function setupMutableQuestionAnswers(initialAnswers: TestAnswer[]) {
  let question: TestQuestion = {
    ...sampleQuestion,
    answers: initialAnswers,
  }

  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/requirement-areas') {
      return okJson({ areas: [sampleArea] })
    }
    if (url === '/api/requirement-packages') {
      return okJson({ requirementPackages: [samplePackage] })
    }
    if (url === '/api/requirement-selection-questions?includeArchived=true') {
      return okJson({ questions: [question] })
    }

    const answerUpdateMatch =
      /^\/api\/requirement-selection-questions\/11\/answers\/(\d+)$/.exec(url)
    if (answerUpdateMatch && init?.method === 'PUT') {
      const answerId = Number(answerUpdateMatch[1])
      const body = JSON.parse(String(init.body ?? '{}')) as {
        sortOrder?: number
      }
      question = {
        ...question,
        answers: question.answers
          .map(answer =>
            answer.id === answerId && typeof body.sortOrder === 'number'
              ? { ...answer, sortOrder: body.sortOrder }
              : answer,
          )
          .sort(
            (left, right) =>
              left.sortOrder - right.sortOrder ||
              left.text.localeCompare(right.text),
          ),
      }
      return okJson(question)
    }

    return okJson({})
  })

  return {
    getQuestion: () => question,
  }
}

function sortQuestionsForTest(questions: TestQuestion[]) {
  return [...questions].sort(
    (left, right) =>
      left.areaName.localeCompare(right.areaName) ||
      left.sortOrder - right.sortOrder ||
      left.questionCode.localeCompare(right.questionCode),
  )
}

function setupMutableQuestions(initialQuestions: TestQuestion[]) {
  let questions = sortQuestionsForTest(initialQuestions)

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

    const questionUpdateMatch =
      /^\/api\/requirement-selection-questions\/(\d+)$/.exec(url)
    if (questionUpdateMatch && init?.method === 'PUT') {
      const questionId = Number(questionUpdateMatch[1])
      const body = JSON.parse(String(init.body ?? '{}')) as {
        sortOrder?: number
      }
      questions = sortQuestionsForTest(
        questions.map(question =>
          question.id === questionId && typeof body.sortOrder === 'number'
            ? { ...question, sortOrder: body.sortOrder }
            : question,
        ),
      )
      return okJson(questions.find(question => question.id === questionId))
    }

    return okJson({})
  })

  return {
    getQuestions: () => questions,
  }
}

describe('RequirementSelectionQuestionsClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    confirmState.confirm.mockResolvedValue(true)
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
    expect(
      screen.queryByRole('spinbutton', { name: 'Sort order' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Help text/ })).toHaveClass(
      'max-h-[28vh]',
      'resize-y',
      'overflow-auto',
    )
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

  it('groups questions by requirement area and keeps question details collapsed by default', async () => {
    const architectureArea = {
      description: 'Architecture ownership.',
      id: 2,
      name: 'Architecture',
      prefix: 'ARK',
    }
    const architectureQuestion: TestQuestion = {
      ...sampleQuestion,
      answers: [
        {
          ...sampleAnswer,
          id: 202,
          questionId: 22,
          text: 'Architecture baseline',
        },
      ],
      areaId: architectureArea.id,
      areaName: architectureArea.name,
      areaPrefix: architectureArea.prefix,
      id: 22,
      questionCode: 'ARK-KUF001',
      text: 'Which architecture profile applies?',
    }
    const securityQuestion: TestQuestion = {
      ...sampleQuestion,
      answers: [sampleAnswer],
    }

    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-areas') {
        return okJson({ areas: [architectureArea, sampleArea] })
      }
      if (url === '/api/requirement-packages') {
        return okJson({ requirementPackages: [samplePackage] })
      }
      if (url === '/api/requirement-selection-questions?includeArchived=true') {
        return okJson({ questions: [architectureQuestion, securityQuestion] })
      }
      return okJson({})
    })

    render(<RequirementSelectionQuestionsClient />)

    expect(
      await screen.findByText(architectureQuestion.text),
    ).toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.map(heading => heading.textContent)).toEqual([
      architectureArea.name,
      sampleArea.name,
    ])
    expect(headings[0]?.parentElement).toHaveClass('bg-primary-50/95')
    expect(screen.getByText(architectureArea.prefix)).toBeInTheDocument()
    expect(getQuestionDisclosure(architectureQuestion.text)).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.queryByRole('button', { name: /hierarchy/i })).toBeNull()
    expect(screen.queryByText('Architecture baseline')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add answer' })).toBeNull()

    expandQuestion(architectureQuestion.text)

    expect(getQuestionDisclosure(architectureQuestion.text)).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByText('Architecture baseline')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add answer' }),
    ).toBeInTheDocument()
  })

  it('opens a read-only hierarchy modal from a separate badge without expanding the question row', async () => {
    const parentQuestion: TestQuestion = {
      ...sampleQuestion,
      answers: [sampleAnswer],
    }
    const childQuestion: TestQuestion = {
      ...sampleQuestion,
      answers: [],
      id: 22,
      questionCode: 'SEC-KUF002',
      sortOrder: 1,
      text: 'Which follow-up applies?',
      visibilityGroups: [
        {
          conditions: [
            {
              answerId: sampleAnswer.id,
              answerIsActive: true,
              answerIsArchived: false,
              answerText: sampleAnswer.text,
              id: 1,
              parentAreaName: parentQuestion.areaName,
              parentQuestionCode: parentQuestion.questionCode,
              parentQuestionId: parentQuestion.id,
              parentQuestionIsActive: true,
              parentQuestionIsArchived: false,
              parentQuestionText: parentQuestion.text,
            },
          ],
          id: 1,
          sortOrder: 0,
        },
      ],
    }

    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-areas') {
        return okJson({ areas: [sampleArea] })
      }
      if (url === '/api/requirement-packages') {
        return okJson({ requirementPackages: [samplePackage] })
      }
      if (url === '/api/requirement-selection-questions?includeArchived=true') {
        return okJson({ questions: [parentQuestion, childQuestion] })
      }
      return okJson({})
    })

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(parentQuestion.text)).toBeInTheDocument()
    expect(getQuestionDisclosure(parentQuestion.text)).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    const hierarchyBadge = screen.getByRole('button', {
      name: /Show requirement selection question hierarchy: SEC-KUF001, 2 questions/,
    })
    expect(hierarchyBadge).toHaveTextContent('Hierarchy · 2')
    expect(
      screen.getByRole('button', {
        name: /Show requirement selection question hierarchy: SEC-KUF002, 2 questions/,
      }),
    ).toHaveTextContent('Hierarchy · 2')

    fireEvent.click(hierarchyBadge)

    expect(getQuestionDisclosure(parentQuestion.text)).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    const dialog = screen.getByRole('dialog', {
      name: 'Requirement Selection Question Hierarchy',
    })
    expect(
      within(dialog).getByText(
        'The lines show which requirement selection questions control other questions through visibility conditions.',
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('group', {
        name: `${parentQuestion.questionCode}: ${parentQuestion.text}, current question`,
      }),
    ).toBeInTheDocument()
    const childNode = within(dialog).getByRole('group', {
      name: `${childQuestion.questionCode}: ${childQuestion.text}`,
    })
    expect(childNode).toBeInTheDocument()
    expect(childNode).toHaveTextContent('Condition group 1')
    expect(childNode).toHaveTextContent(sampleAnswer.text)
    expect(dialog.querySelector('svg > path[d^="M"]')).toBeTruthy()
  })

  it('keeps multiple questions expanded and does not auto-expand answer search hits', async () => {
    const secondQuestion: TestQuestion = {
      ...sampleQuestion,
      answers: [
        {
          ...sampleAnswer,
          id: 201,
          questionId: 22,
          text: 'Enhanced profile',
        },
      ],
      id: 22,
      questionCode: 'SEC-KUF002',
      text: 'Which enhanced profile applies?',
    }
    const questions = [
      { ...sampleQuestion, answers: [sampleAnswer] },
      secondQuestion,
    ]

    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-areas') {
        return okJson({ areas: [sampleArea] })
      }
      if (url === '/api/requirement-packages') {
        return okJson({ requirementPackages: [samplePackage] })
      }
      if (url === '/api/requirement-selection-questions?includeArchived=true') {
        return okJson({ questions })
      }
      return okJson({})
    })

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(sampleQuestion.text)).toBeInTheDocument()
    expandQuestion(sampleQuestion.text)
    expandQuestion(secondQuestion.text)

    expect(getQuestionDisclosure(sampleQuestion.text)).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(getQuestionDisclosure(secondQuestion.text)).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    fireEvent.click(getQuestionDisclosure(sampleQuestion.text))
    expect(getQuestionDisclosure(sampleQuestion.text)).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(getQuestionDisclosure(secondQuestion.text)).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search question ID or text' }),
      { target: { value: sampleAnswer.text } },
    )

    expect(screen.getByText(sampleQuestion.text)).toBeInTheDocument()
    expect(screen.queryByText(secondQuestion.text)).not.toBeInTheDocument()
    expect(screen.queryByText(sampleAnswer.text)).not.toBeInTheDocument()
    expect(getQuestionDisclosure(sampleQuestion.text)).toHaveAttribute(
      'aria-expanded',
      'false',
    )
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
    expandQuestion(sampleQuestion.text)

    fireEvent.click(screen.getByRole('button', { name: 'Add answer' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Help: Requirement IDs',
      }),
    )
    expect(
      screen.getByText(/Search and add published requirements/),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

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
    const existingQuestion = {
      ...sampleQuestion,
      id: 77,
      questionCode: 'SEC-KUF000',
      sortOrder: 3,
      text: 'Existing security question',
    }
    const createdQuestion = {
      ...sampleQuestion,
      id: 99,
      isActive: false,
      sortOrder: 4,
    }
    let questions: unknown[] = [existingQuestion]

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
        questions = [existingQuestion, createdQuestion]
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
    expect(screen.getByText(sampleArea.description)).toBeInTheDocument()
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
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/requirement-selection-questions' &&
        init?.method === 'POST',
    )
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      areaId: sampleArea.id,
      selectionType: 'single',
      sortOrder: 4,
      text: createdQuestion.text,
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByText(createdQuestion.text)).toBeInTheDocument()
  })

  it('shows the selected area description and locked state when editing a question', async () => {
    const questions = [sampleQuestion]

    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-areas') {
        return okJson({ areas: [sampleArea] })
      }
      if (url === '/api/requirement-packages') {
        return okJson({ requirementPackages: [samplePackage] })
      }
      if (url === '/api/requirement-selection-questions?includeArchived=true') {
        return okJson({ questions })
      }
      return okJson({})
    })

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(sampleQuestion.text)).toBeInTheDocument()
    const questionCard = expandQuestion(sampleQuestion.text)

    fireEvent.click(
      within(questionCard).getByRole('button', {
        name: 'Edit',
      }),
    )

    const dialog = screen.getByRole('dialog', {
      name: 'Edit requirement selection question',
    })
    const areaSelect = within(dialog as HTMLElement).getByRole('combobox', {
      name: /Requirement area/,
    })

    expect(areaSelect).toBeDisabled()
    expect(areaSelect).toHaveClass(
      'disabled:cursor-not-allowed',
      'disabled:bg-secondary-100',
      'dark:disabled:bg-secondary-900/70',
    )
    expect(areaSelect).toHaveAttribute(
      'title',
      'The requirement area cannot be changed after the question has been created.',
    )
    expect(areaSelect).toHaveAccessibleDescription(
      `${sampleArea.description} Requirement area is locked after the question has been created.`,
    )
    expect(
      within(dialog as HTMLElement).queryByRole('spinbutton', {
        name: 'Sort order',
      }),
    ).not.toBeInTheDocument()
    expect(
      within(dialog as HTMLElement).getByText(sampleArea.description),
    ).toBeInTheDocument()
    expect(
      within(dialog as HTMLElement).getByText(
        'Requirement area is locked after the question has been created.',
      ),
    ).toBeInTheDocument()
  })

  it('opens and submits a new answer from the contextual question button', async () => {
    const createdAnswer = {
      ...sampleAnswer,
      id: 202,
      requirementIds: [301],
      text: 'Created profile',
    }
    let questions: TestQuestion[] = [sampleQuestion]

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
      if (url.startsWith('/api/requirements?')) {
        return okJson({
          requirements: [
            {
              id: 301,
              uniqueId: 'SEC-001',
              version: { description: 'Use strong authentication' },
            },
          ],
        })
      }
      if (
        url.startsWith(
          '/api/requirement-selection-questions/matched-requirements?',
        )
      ) {
        return okJson({ requirements: sampleAnswer.matchingRequirements })
      }
      if (
        url === '/api/requirement-selection-questions/11/answers' &&
        init?.method === 'POST'
      ) {
        questions = [{ ...sampleQuestion, answers: [createdAnswer] }]
        return okJson(questions[0])
      }
      return okJson({})
    })

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(sampleQuestion.text)).toBeInTheDocument()
    const questionCard = expandQuestion(sampleQuestion.text)

    const addButton = within(questionCard).getByRole('button', {
      name: 'Add answer',
    })
    expect(addButton).toHaveAttribute(
      'data-developer-mode-value',
      'new requirement selection answer',
    )
    fireEvent.click(addButton)

    const answerDialog = screen.getByRole('dialog', { name: 'Add answer' })
    expect(answerDialog).toBeInTheDocument()
    expect(
      within(answerDialog as HTMLElement).queryByRole('spinbutton', {
        name: 'Sort order',
      }),
    ).not.toBeInTheDocument()
    fireEvent.change(
      within(answerDialog as HTMLElement).getByRole('textbox', {
        name: /^Text/,
      }),
      {
        target: { value: createdAnswer.text },
      },
    )
    fireEvent.change(
      within(answerDialog as HTMLElement).getByRole('textbox', {
        name: /Requirement IDs/,
      }),
      {
        target: { value: 'SEC' },
      },
    )
    fireEvent.click(
      await within(answerDialog as HTMLElement).findByRole('button', {
        name: /^SEC-001/,
      }),
    )
    fireEvent.click(
      within(answerDialog as HTMLElement).getByRole('button', {
        name: 'Add answer',
      }),
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-selection-questions/11/answers',
        expect.objectContaining({
          body: JSON.stringify({
            description: undefined,
            isNoRequirementSelection: false,
            packageIds: [],
            requirementIds: [301],
            sortOrder: 0,
            text: createdAnswer.text,
          }),
          method: 'POST',
        }),
      )
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByText(createdAnswer.text)).toBeInTheDocument()
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
    expandQuestion('Second question')
    const secondAnswerCard = getAnswerCard('Second answer')
    const answerEditButton = within(secondAnswerCard).getByRole('button', {
      name: 'Edit',
    })
    if (!answerEditButton) throw new Error('Missing answer edit button')
    fireEvent.click(answerEditButton)

    expect(
      screen.getByRole('dialog', { name: 'Edit requirement selection answer' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^Text/ })).toHaveValue(
      'Second answer',
    )
    expect(
      within(
        screen.getByRole('dialog', {
          name: 'Edit requirement selection answer',
        }) as HTMLElement,
      ).queryByRole('spinbutton', {
        name: 'Sort order',
      }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-selection-questions/22/answers/201',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
  })

  it('hides answer edit chrome and confirms before discarding unsaved answer changes', async () => {
    const questions = [{ ...sampleQuestion, answers: [sampleAnswer] }]

    fetchMock.mockImplementation(async (url: string) => {
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
        url.startsWith(
          '/api/requirement-selection-questions/matched-requirements?',
        )
      ) {
        return okJson({ requirements: sampleAnswer.matchingRequirements })
      }
      return okJson({})
    })

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(sampleQuestion.text)).toBeInTheDocument()
    expandQuestion(sampleQuestion.text)
    expect(screen.getByText(sampleAnswer.text)).toBeInTheDocument()
    const answerCard = getAnswerCard(sampleAnswer.text)

    const openEditDialog = () => {
      fireEvent.click(
        within(answerCard).getByRole('button', {
          name: 'Edit',
        }),
      )
      return screen.getByRole('dialog', {
        name: 'Edit requirement selection answer',
      })
    }

    let dialog = openEditDialog()
    expect(
      within(dialog as HTMLElement).getByRole('heading', {
        name: 'Edit requirement selection answer',
      }),
    ).toHaveClass('sr-only')
    expect(
      within(dialog as HTMLElement).queryByText(sampleQuestion.questionCode),
    ).not.toBeInTheDocument()
    expect(
      within(dialog as HTMLElement).queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument()

    fireEvent.click(
      within(dialog as HTMLElement).getByRole('button', { name: 'Cancel' }),
    )
    expect(confirmState.confirm).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    dialog = openEditDialog()
    const answerText = within(dialog as HTMLElement).getByRole('textbox', {
      name: /^Text/,
    })
    fireEvent.change(answerText, {
      target: { value: 'Updated answer text' },
    })
    confirmState.confirm.mockResolvedValueOnce(false)
    const cancelButton = within(dialog as HTMLElement).getByRole('button', {
      name: 'Cancel',
    })
    fireEvent.click(cancelButton)

    await waitFor(() => {
      expect(confirmState.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          anchorEl: cancelButton,
          confirmText: 'Discard changes',
          defaultCancel: true,
          icon: 'caution',
          message: 'You have unsaved changes. Discard them?',
          variant: 'danger',
        }),
      )
    })
    expect(
      screen.getByRole('dialog', { name: 'Edit requirement selection answer' }),
    ).toBeInTheDocument()

    confirmState.confirm.mockResolvedValueOnce(true)
    fireEvent.click(cancelButton)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('edits answers with package checkboxes, live matches, and library-style read-only requirement details', async () => {
    const questions = [{ ...sampleQuestion, answers: [sampleAnswer] }]

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
        url.startsWith(
          '/api/requirement-selection-questions/matched-requirements?',
        )
      ) {
        return okJson({
          requirements: sampleAnswer.matchingRequirements,
        })
      }
      if (url.startsWith('/api/requirements?')) {
        return okJson({
          requirements: [
            {
              id: 301,
              uniqueId: 'SEC-001',
              version: { description: 'Use strong authentication' },
            },
          ],
        })
      }
      if (url === '/api/requirements/301') {
        return okJson(sampleRequirementDetail())
      }
      if (
        url === '/api/requirement-selection-questions/11/answers/101' &&
        init?.method === 'PUT'
      ) {
        return okJson(sampleQuestion)
      }
      return okJson({})
    })

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(sampleQuestion.text)).toBeInTheDocument()
    expandQuestion(sampleQuestion.text)
    expect(screen.getByText(sampleAnswer.text)).toBeInTheDocument()
    const answerCard = getAnswerCard(sampleAnswer.text)
    const sourceSummary = within(answerCard).getByRole('group', {
      name: 'Requirement selection sources',
    })
    expect(sourceSummary).toHaveTextContent(samplePackage.name)
    expect(sourceSummary).toHaveTextContent('SEC-001')
    expect(sourceSummary).not.toHaveTextContent('301')
    expect(sourceSummary).not.toHaveTextContent('10')
    fireEvent.click(within(answerCard).getByRole('button', { name: 'Edit' }))

    const dialog = screen.getByRole('dialog', {
      name: 'Edit requirement selection answer',
    })
    const saveButton = within(dialog as HTMLElement).getByRole('button', {
      name: 'Save',
    })
    expect(saveButton.querySelector('.lucide-save')).toBeInTheDocument()
    expect(saveButton.querySelector('.lucide-plus')).not.toBeInTheDocument()

    const packageSelector = within(dialog as HTMLElement).getByRole('button', {
      name: 'Requirement packages',
    })
    expect(packageSelector).toHaveTextContent('Choose packages (1)')
    fireEvent.click(packageSelector)
    const packageCheckbox = await within(dialog as HTMLElement).findByRole(
      'checkbox',
      { name: samplePackage.name },
    )
    expect(packageCheckbox).toBeChecked()
    fireEvent.click(packageCheckbox)
    expect(packageCheckbox).not.toBeChecked()
    fireEvent.click(packageCheckbox)
    expect(packageCheckbox).toBeChecked()
    expect(
      within(dialog as HTMLElement).getByRole('group', {
        name: 'Selected requirement packages',
      }),
    ).toHaveTextContent(samplePackage.name)

    fireEvent.click(
      within(dialog as HTMLElement).getByRole('button', {
        name: 'Remove requirement SEC-001',
      }),
    )
    expect(
      within(dialog as HTMLElement).queryByRole('group', {
        name: 'Selected Requirement IDs',
      }),
    ).not.toBeInTheDocument()
    fireEvent.change(
      within(dialog as HTMLElement).getByRole('textbox', {
        name: /Requirement IDs/,
      }),
      { target: { value: 'SEC' } },
    )
    fireEvent.click(
      await within(dialog as HTMLElement).findByRole('button', {
        name: /^SEC-001/,
      }),
    )
    expect(
      within(dialog as HTMLElement).getByRole('group', {
        name: 'Selected Requirement IDs',
      }),
    ).toHaveTextContent('SEC-001')

    const matchedRequirementsHeading = within(dialog as HTMLElement).getByRole(
      'heading',
      { name: 'Requirements in selection' },
    )
    const matchedRequirementsColumn =
      matchedRequirementsHeading.closest('section')
    if (!(matchedRequirementsColumn instanceof HTMLElement)) {
      throw new Error('Missing matched requirements column')
    }
    expect(
      within(matchedRequirementsColumn).getByText('Read-only'),
    ).toBeInTheDocument()
    expect(
      within(matchedRequirementsColumn).getByText(
        'From selected packages and direct Requirement IDs',
      ),
    ).toBeInTheDocument()
    expect(
      await within(matchedRequirementsColumn).findByText('Directly selected'),
    ).toBeInTheDocument()
    expect(
      within(matchedRequirementsColumn).getByText(samplePackage.name),
    ).toBeInTheDocument()
    const matchedRequirementsRows = await within(
      matchedRequirementsColumn,
    ).findByRole('list')
    expect(matchedRequirementsRows).toHaveClass(
      'divide-y',
      'divide-secondary-200',
    )
    const matchedRequirementsFrame =
      matchedRequirementsRows.parentElement?.parentElement
    if (!matchedRequirementsFrame) {
      throw new Error('Missing matched requirements scroll frame')
    }
    const matchedRequirementsList = matchedRequirementsRows.parentElement
    if (!(matchedRequirementsList instanceof HTMLElement)) {
      throw new Error('Missing matched requirements scroll list')
    }
    expect(matchedRequirementsList).toHaveClass(
      'h-[min(48vh,32rem)]',
      'min-h-64',
      'overflow-y-auto',
      'shadow-inner',
      'bg-secondary-50/70',
    )
    mockScrollMetrics(matchedRequirementsList, {
      clientHeight: 200,
      scrollHeight: 600,
    })
    fireEvent(window, new Event('resize'))
    fireEvent.scroll(matchedRequirementsList)
    await waitFor(() => {
      expect(
        matchedRequirementsFrame.querySelector(
          '[data-scroll-overflow-cue="end"]',
        ),
      ).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([calledUrl]) =>
            calledUrl ===
            '/api/requirement-selection-questions/matched-requirements?packageIds=10&requirementIds=301',
        ),
      ).toBe(true)
    })

    const requirementButton = await within(dialog as HTMLElement).findByRole(
      'button',
      {
        name: 'Open requirement details SEC-001',
      },
    )
    expect(requirementButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(requirementButton)
    expect(requirementButton).toHaveAttribute('aria-expanded', 'true')

    expect(
      await within(dialog as HTMLElement).findByText(
        'Detailed published requirement',
      ),
    ).toBeInTheDocument()
    const detailCard = within(dialog as HTMLElement)
      .getByText('Detailed published requirement')
      .closest('[data-developer-mode-name="matched requirement detail"]')
    if (!(detailCard instanceof HTMLElement)) {
      throw new Error('Missing matched requirement detail card')
    }
    expect(detailCard).toHaveClass(
      'rounded-2xl',
      'p-6',
      'space-y-5',
      'bg-white/80',
      'text-sm',
    )
    expect(detailCard.parentElement).toHaveClass('px-6', 'py-4')
    expect(
      within(detailCard).queryByRole('heading', { name: 'SEC-001' }),
    ).not.toBeInTheDocument()
    expect(
      within(dialog as HTMLElement).getByText('Acceptance detail'),
    ).toBeInTheDocument()
    expect(
      within(dialog as HTMLElement).queryByRole('button', { name: 'Archive' }),
    ).not.toBeInTheDocument()

    fireEvent.click(
      within(dialog as HTMLElement).getByRole('checkbox', {
        name: 'No requirement selection',
      }),
    )
    expect(packageSelector).toBeDisabled()
    expect(
      within(dialog as HTMLElement).getByRole('textbox', {
        name: /Requirement IDs/,
      }),
    ).toBeDisabled()
    expect(
      await within(dialog as HTMLElement).findByText(
        'Choose packages or search for Requirement IDs to preview requirements in the selection.',
      ),
    ).toBeInTheDocument()
  })

  it('filters expanded answer requirements by the union of selected source pills', async () => {
    const multiSourceAnswer: TestAnswer = {
      ...sampleAnswer,
      matchingRequirementCount: 3,
      matchingRequirements: [
        {
          description: 'Use strong authentication',
          direct: true,
          id: 301,
          sourcePackages: [{ id: samplePackage.id, name: samplePackage.name }],
          uniqueId: 'SEC-001',
        },
        {
          description: 'Require privileged access review',
          direct: false,
          id: 302,
          sourcePackages: [{ id: secondPackage.id, name: secondPackage.name }],
          uniqueId: 'SEC-002',
        },
        {
          description: 'Log administrative sessions',
          direct: true,
          id: 303,
          sourcePackages: [],
          uniqueId: 'SEC-003',
        },
      ],
      packageIds: [samplePackage.id, secondPackage.id],
      requirementIds: [301, 303],
    }
    const questions = [{ ...sampleQuestion, answers: [multiSourceAnswer] }]

    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-areas') {
        return okJson({ areas: [sampleArea] })
      }
      if (url === '/api/requirement-packages') {
        return okJson({ requirementPackages: [samplePackage, secondPackage] })
      }
      if (url === '/api/requirement-selection-questions?includeArchived=true') {
        return okJson({ questions })
      }
      return okJson({})
    })

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(sampleQuestion.text)).toBeInTheDocument()
    expandQuestion(sampleQuestion.text)
    expect(screen.getByText(multiSourceAnswer.text)).toBeInTheDocument()
    const answerCard = getAnswerCard(multiSourceAnswer.text)

    const baselinePill = within(answerCard).getByRole('button', {
      name: 'Filter requirements by requirement package Baseline',
    })
    const enhancedPill = within(answerCard).getByRole('button', {
      name: 'Filter requirements by requirement package Enhanced',
    })
    const directRequirementPill = within(answerCard).getByRole('button', {
      name: 'Filter requirements by Requirement ID SEC-003',
    })

    fireEvent.click(baselinePill)
    expect(baselinePill).toHaveAttribute('aria-pressed', 'true')
    expect(baselinePill).toHaveClass(
      'border-primary-600',
      'ring-1',
      'ring-primary-300',
    )
    let filteredList = within(answerCard).getByRole('list', {
      name: 'Requirements in selection',
    })
    expect(within(filteredList).getByText('SEC-001')).toBeInTheDocument()
    const overlappingRequirementRow = within(filteredList)
      .getByText('SEC-001')
      .closest('li')
    if (!overlappingRequirementRow) {
      throw new Error('Missing overlapping requirement row')
    }
    expect(
      within(overlappingRequirementRow as HTMLElement).getByText(
        'Directly selected',
      ),
    ).toBeInTheDocument()
    expect(
      within(overlappingRequirementRow as HTMLElement).getByText('Baseline'),
    ).toBeInTheDocument()
    expect(within(filteredList).getAllByText('SEC-001')).toHaveLength(1)
    expect(within(filteredList).queryByText('SEC-002')).not.toBeInTheDocument()
    expect(within(filteredList).queryByText('SEC-003')).not.toBeInTheDocument()

    fireEvent.click(enhancedPill)
    expect(enhancedPill).toHaveAttribute('aria-pressed', 'true')
    filteredList = within(answerCard).getByRole('list', {
      name: 'Requirements in selection',
    })
    expect(within(filteredList).getByText('SEC-001')).toBeInTheDocument()
    expect(within(filteredList).getByText('SEC-002')).toBeInTheDocument()
    expect(within(filteredList).queryByText('SEC-003')).not.toBeInTheDocument()
    expect(
      within(answerCard).getByRole('button', {
        name: 'Hide requirements in selection for Baseline profile',
      }),
    ).toHaveTextContent('2/3 requirements')

    fireEvent.click(directRequirementPill)
    expect(directRequirementPill).toHaveAttribute('aria-pressed', 'true')
    expect(directRequirementPill).toHaveClass(
      'border-primary-700',
      'ring-1',
      'ring-primary-300',
    )
    filteredList = within(answerCard).getByRole('list', {
      name: 'Requirements in selection',
    })
    expect(within(filteredList).getByText('SEC-001')).toBeInTheDocument()
    expect(within(filteredList).getByText('SEC-002')).toBeInTheDocument()
    expect(within(filteredList).getByText('SEC-003')).toBeInTheDocument()
    expect(
      within(answerCard).getByRole('button', {
        name: 'Hide requirements in selection for Baseline profile',
      }),
    ).toHaveTextContent('3/3 requirements')

    fireEvent.click(baselinePill)
    expect(baselinePill).toHaveAttribute('aria-pressed', 'false')
    filteredList = within(answerCard).getByRole('list', {
      name: 'Requirements in selection',
    })
    expect(within(filteredList).queryByText('SEC-001')).not.toBeInTheDocument()
    expect(within(filteredList).getByText('SEC-002')).toBeInTheDocument()
    expect(within(filteredList).getByText('SEC-003')).toBeInTheDocument()
  })

  it('keeps question deletion behind confirmation', async () => {
    confirmState.confirm.mockResolvedValue(false)
    const questions = [{ ...sampleQuestion, answers: [sampleAnswer] }]

    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-areas') {
        return okJson({ areas: [sampleArea] })
      }
      if (url === '/api/requirement-packages') {
        return okJson({ requirementPackages: [samplePackage] })
      }
      if (url === '/api/requirement-selection-questions?includeArchived=true') {
        return okJson({ questions })
      }
      return okJson({})
    })

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(sampleQuestion.text)).toBeInTheDocument()
    expandQuestion(sampleQuestion.text)
    const deleteButton = screen.getAllByRole('button', { name: 'Delete' })[0]
    if (!deleteButton) throw new Error('Missing question delete button')
    const callCountBeforeDelete = fetchMock.mock.calls.length
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(confirmState.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          anchorEl: deleteButton,
          icon: 'caution',
          message: 'Delete this requirement selection question?',
          variant: 'danger',
        }),
      )
    })
    expect(
      fetchMock.mock.calls.slice(callCountBeforeDelete),
    ).not.toContainEqual([
      '/api/requirement-selection-questions/11',
      expect.objectContaining({ method: 'DELETE' }),
    ])
  })

  it('archives answers only after confirmation', async () => {
    const questions = [{ ...sampleQuestion, answers: [sampleAnswer] }]

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
        url === '/api/requirement-selection-questions/11/answers/101/archive' &&
        init?.method === 'POST'
      ) {
        return okJson({})
      }
      return okJson({})
    })

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(sampleQuestion.text)).toBeInTheDocument()
    expandQuestion(sampleQuestion.text)
    expect(screen.getByText(sampleAnswer.text)).toBeInTheDocument()
    const answerCard = getAnswerCard(sampleAnswer.text)
    const archiveButton = within(answerCard).getByRole('button', {
      name: 'Archive',
    })
    fireEvent.click(archiveButton)

    await waitFor(() => {
      expect(confirmState.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          anchorEl: archiveButton,
          icon: 'caution',
          message: 'Archive this answer?',
          variant: 'danger',
        }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-selection-questions/11/answers/101/archive',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('live-reorders questions within an area while dragging the handle and saves sort order on drop', async () => {
    const secondQuestion: TestQuestion = {
      ...sampleQuestion,
      id: 22,
      questionCode: 'SEC-KUF002',
      sortOrder: 1,
      text: 'Which assurance profile applies?',
    }
    const thirdQuestion: TestQuestion = {
      ...sampleQuestion,
      id: 33,
      questionCode: 'SEC-KUF003',
      sortOrder: 2,
      text: 'Which logging profile applies?',
    }
    const state = setupMutableQuestions([
      sampleQuestion,
      secondQuestion,
      thirdQuestion,
    ])

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(sampleQuestion.text)).toBeInTheDocument()
    expect(countQuestionListFetches()).toBe(1)
    const sourceCard = getQuestionCard(sampleQuestion.text)
    const targetCard = getQuestionCard(thirdQuestion.text)
    const questionList = sourceCard.parentElement
    if (!questionList) throw new Error('Missing question list')

    expect(sourceCard).not.toHaveAttribute('draggable')
    const sourceHeader = sourceCard.firstElementChild
    if (!(sourceHeader instanceof HTMLElement)) {
      throw new Error('Missing question header')
    }
    expect(sourceHeader).not.toHaveAttribute('draggable')
    const dragHandle = within(sourceCard).getByRole('button', {
      name: 'Reorder question',
    })
    expect(dragHandle).toHaveClass('self-stretch', 'w-11')
    expect(dragHandle).not.toHaveAttribute('draggable')

    const dataTransfer = createDragDataTransfer()
    fireEvent.pointerDown(dragHandle)
    expect(sourceCard).not.toHaveAttribute('draggable')
    expect(sourceHeader).toHaveAttribute('draggable', 'true')
    fireEvent.dragStart(sourceHeader, { dataTransfer })

    await waitFor(() => {
      expect(dataTransfer.setDragImage).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.any(Number),
        expect.any(Number),
      )
      expect(sourceCard).toHaveClass('bg-secondary-200/95')
      expect(sourceCard.firstElementChild).toHaveClass('invisible')
    })

    fireEvent.dragOver(targetCard, { dataTransfer })

    await waitFor(() => {
      const cards = Array.from(questionList.children)
      expect(cards[0]).toHaveTextContent(secondQuestion.text)
      expect(cards[1]).toHaveTextContent(thirdQuestion.text)
      expect(cards[2]).toHaveTextContent(sampleQuestion.text)
      expect(cards[1]).toHaveClass('bg-secondary-100/95')
      expect(cards[2]).toHaveClass('bg-secondary-200/95')
      expect(cards[2]?.firstElementChild).toHaveClass('invisible')
    })

    fireEvent.drop(targetCard, { dataTransfer })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-selection-questions/11',
        expect.objectContaining({
          body: JSON.stringify({ sortOrder: 2 }),
          method: 'PUT',
        }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-selection-questions/22',
        expect.objectContaining({
          body: JSON.stringify({ sortOrder: 0 }),
          method: 'PUT',
        }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-selection-questions/33',
        expect.objectContaining({
          body: JSON.stringify({ sortOrder: 1 }),
          method: 'PUT',
        }),
      )
    })
    expect(state.getQuestions().map(question => question.id)).toEqual([
      22, 33, 11,
    ])
    await flushAsyncWork()
    expect(countQuestionListFetches()).toBe(1)
  })

  it('restores the original question order when a live drag is canceled', async () => {
    const secondQuestion: TestQuestion = {
      ...sampleQuestion,
      id: 22,
      questionCode: 'SEC-KUF002',
      sortOrder: 1,
      text: 'Which assurance profile applies?',
    }
    setupMutableQuestions([sampleQuestion, secondQuestion])

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(sampleQuestion.text)).toBeInTheDocument()
    const sourceCard = getQuestionCard(sampleQuestion.text)
    const targetCard = getQuestionCard(secondQuestion.text)
    const questionList = sourceCard.parentElement
    if (!questionList) throw new Error('Missing question list')

    const dataTransfer = createDragDataTransfer()
    const dragHandle = within(sourceCard).getByRole('button', {
      name: 'Reorder question',
    })
    const sourceHeader = sourceCard.firstElementChild
    if (!(sourceHeader instanceof HTMLElement)) {
      throw new Error('Missing question header')
    }
    fireEvent.pointerDown(dragHandle)
    expect(sourceCard).not.toHaveAttribute('draggable')
    expect(sourceHeader).toHaveAttribute('draggable', 'true')
    fireEvent.dragStart(sourceHeader, { dataTransfer })
    fireEvent.dragOver(targetCard, { dataTransfer })

    await waitFor(() => {
      const cards = Array.from(questionList.children)
      expect(cards[0]).toHaveTextContent(secondQuestion.text)
      expect(cards[1]).toHaveTextContent(sampleQuestion.text)
      expect(cards[0]).toHaveClass('bg-secondary-100/95')
    })

    fireEvent.dragEnd(sourceHeader, { dataTransfer })

    await waitFor(() => {
      const cards = Array.from(questionList.children)
      expect(cards[0]).toHaveTextContent(sampleQuestion.text)
      expect(cards[1]).toHaveTextContent(secondQuestion.text)
      expect(cards[0]).not.toHaveClass('bg-secondary-200/95')
      expect(cards[0]).not.toHaveClass('bg-secondary-100/95')
      expect(cards[0]?.firstElementChild).not.toHaveClass('invisible')
    })
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          /^\/api\/requirement-selection-questions\/\d+$/.test(String(url)) &&
          init?.method === 'PUT',
      ),
    ).toBe(false)
  })

  it('reorders questions from the handle with keyboard arrows', async () => {
    const secondQuestion: TestQuestion = {
      ...sampleQuestion,
      id: 22,
      questionCode: 'SEC-KUF002',
      sortOrder: 1,
      text: 'Which assurance profile applies?',
    }
    const state = setupMutableQuestions([sampleQuestion, secondQuestion])

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(secondQuestion.text)).toBeInTheDocument()
    const secondQuestionCard = getQuestionCard(secondQuestion.text)

    fireEvent.keyDown(
      within(secondQuestionCard).getByRole('button', {
        name: 'Reorder question',
      }),
      { key: 'ArrowUp' },
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-selection-questions/11',
        expect.objectContaining({
          body: JSON.stringify({ sortOrder: 1 }),
          method: 'PUT',
        }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-selection-questions/22',
        expect.objectContaining({
          body: JSON.stringify({ sortOrder: 0 }),
          method: 'PUT',
        }),
      )
    })
    expect(state.getQuestions().map(question => question.id)).toEqual([22, 11])
  })

  it('disables question reordering while search or status filters are active', async () => {
    const secondQuestion: TestQuestion = {
      ...sampleQuestion,
      id: 22,
      questionCode: 'SEC-KUF002',
      sortOrder: 1,
      text: 'Which assurance profile applies?',
    }
    setupMutableQuestions([sampleQuestion, secondQuestion])

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(sampleQuestion.text)).toBeInTheDocument()
    const sourceCard = getQuestionCard(sampleQuestion.text)
    const search = screen.getByRole('textbox', {
      name: 'Search question ID or text',
    })
    const statusFilter = screen.getByRole('combobox', {
      name: 'All statuses',
    })

    expect(
      within(sourceCard).getByRole('button', { name: 'Reorder question' }),
    ).toBeEnabled()

    fireEvent.change(search, { target: { value: 'profile' } })
    let dragHandle = within(getQuestionCard(sampleQuestion.text)).getByRole(
      'button',
      { name: 'Reorder question' },
    )
    expect(dragHandle).toBeDisabled()
    expect(dragHandle).toHaveAttribute(
      'title',
      'Clear search and status filters to reorder questions.',
    )

    fireEvent.pointerDown(dragHandle)
    expect(getQuestionCard(sampleQuestion.text)).not.toHaveAttribute(
      'draggable',
    )

    fireEvent.change(search, { target: { value: '' } })
    fireEvent.change(statusFilter, { target: { value: 'active' } })
    dragHandle = within(getQuestionCard(sampleQuestion.text)).getByRole(
      'button',
      { name: 'Reorder question' },
    )
    expect(dragHandle).toBeDisabled()
    expect(dragHandle).toHaveAttribute(
      'title',
      'Clear search and status filters to reorder questions.',
    )
  })

  it('live-reorders answers while dragging the handle and saves sort order on drop', async () => {
    const secondAnswer = {
      ...sampleAnswer,
      id: 102,
      requirementIds: [302],
      sortOrder: 1,
      text: 'Enhanced profile',
    }
    const thirdAnswer = {
      ...sampleAnswer,
      id: 103,
      isNoRequirementSelection: true,
      packageIds: [],
      requirementIds: [],
      sortOrder: 2,
      text: 'No special profile',
    }
    const state = setupMutableQuestionAnswers([
      sampleAnswer,
      secondAnswer,
      thirdAnswer,
    ])

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(sampleQuestion.text)).toBeInTheDocument()
    expandQuestion(sampleQuestion.text)
    expect(screen.getByText(sampleAnswer.text)).toBeInTheDocument()
    expect(countQuestionListFetches()).toBe(1)
    const sourceRow = screen.getByText(sampleAnswer.text).closest('li')
    const targetRow = screen.getByText(thirdAnswer.text).closest('li')
    if (!sourceRow || !targetRow) {
      throw new Error('Missing draggable answer row')
    }
    expect(sourceRow).toHaveAttribute('draggable', 'true')
    const dragHandle = within(sourceRow as HTMLElement).getByRole('button', {
      name: 'Reorder answer',
    })
    expect(dragHandle).not.toHaveAttribute('draggable')
    expect(dragHandle).toHaveClass(
      'cursor-grab',
      'self-stretch',
      'touch-none',
      'w-8',
      'text-secondary-700',
    )
    const answerList = sourceRow.closest('ul')
    const questionCard = getQuestionCard(sampleQuestion.text)
    if (!answerList) throw new Error('Missing answer list')

    const blockedDataTransfer = createDragDataTransfer()
    fireEvent.dragStart(sourceRow, { dataTransfer: blockedDataTransfer })
    expect(blockedDataTransfer.setDragImage).not.toHaveBeenCalled()
    expect(sourceRow).not.toHaveClass('bg-secondary-200/95')

    const dataTransfer = createDragDataTransfer()
    fireEvent.pointerDown(dragHandle)
    expect(sourceRow).toHaveAttribute('draggable', 'true')
    expect(questionCard).not.toHaveAttribute('draggable')
    fireEvent.dragStart(sourceRow, { dataTransfer })

    await waitFor(() => {
      expect(dataTransfer.setDragImage).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.any(Number),
        expect.any(Number),
      )
      expect(sourceRow).toHaveClass('bg-secondary-200/95')
      expect(sourceRow.firstElementChild).toHaveClass('invisible')
      expect(questionCard).not.toHaveClass('bg-secondary-200/95')
      expect(questionCard.firstElementChild).not.toHaveClass('invisible')
    })

    fireEvent.dragOver(targetRow, { dataTransfer })
    await waitFor(() => {
      const rows = within(answerList as HTMLElement).getAllByRole('listitem')
      expect(rows[0]).toHaveTextContent(secondAnswer.text)
      expect(rows[1]).toHaveTextContent(thirdAnswer.text)
      expect(rows[2]).toHaveTextContent(sampleAnswer.text)
      expect(rows[1]).toHaveClass('bg-secondary-100/95')
      expect(rows[2]).toHaveClass('bg-secondary-200/95')
      expect(rows[2]?.firstElementChild).toHaveClass('invisible')
      expect(questionCard).not.toHaveClass('bg-secondary-200/95')
      expect(questionCard.firstElementChild).not.toHaveClass('invisible')
    })

    fireEvent.drop(targetRow, { dataTransfer })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-selection-questions/11/answers/101',
        expect.objectContaining({
          body: JSON.stringify({ sortOrder: 2 }),
          method: 'PUT',
        }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-selection-questions/11/answers/102',
        expect.objectContaining({
          body: JSON.stringify({ sortOrder: 0 }),
          method: 'PUT',
        }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-selection-questions/11/answers/103',
        expect.objectContaining({
          body: JSON.stringify({ sortOrder: 1 }),
          method: 'PUT',
        }),
      )
    })
    expect(state.getQuestion().answers.map(answer => answer.id)).toEqual([
      102, 103, 101,
    ])
    await flushAsyncWork()
    expect(countQuestionListFetches()).toBe(1)
  })

  it('starts answer drag from the handle when the answer is expanded', async () => {
    const secondAnswer = {
      ...sampleAnswer,
      id: 102,
      requirementIds: [302],
      sortOrder: 1,
      text: 'Enhanced profile',
    }
    const state = setupMutableQuestionAnswers([sampleAnswer, secondAnswer])

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(sampleQuestion.text)).toBeInTheDocument()
    expandQuestion(sampleQuestion.text)
    expect(screen.getByText(sampleAnswer.text)).toBeInTheDocument()
    const answerCard = getAnswerCard(sampleAnswer.text)
    fireEvent.click(
      within(answerCard).getByRole('button', {
        name: 'Show requirements in selection for Baseline profile',
      }),
    )
    expect(
      within(answerCard).getByRole('list', {
        name: 'Requirements in selection',
      }),
    ).toBeInTheDocument()

    const sourceRow = screen.getByText(sampleAnswer.text).closest('li')
    const targetRow = screen.getByText(secondAnswer.text).closest('li')
    if (!sourceRow || !targetRow) {
      throw new Error('Missing draggable answer row')
    }
    const dragHandle = within(sourceRow as HTMLElement).getByRole('button', {
      name: 'Reorder answer',
    })

    const dataTransfer = createDragDataTransfer()
    fireEvent.pointerDown(dragHandle)
    expect(sourceRow).toHaveAttribute('draggable', 'true')
    fireEvent.dragStart(sourceRow, { dataTransfer })
    await waitFor(() => {
      expect(dataTransfer.setDragImage).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.any(Number),
        expect.any(Number),
      )
      expect(sourceRow).toHaveClass('bg-secondary-200/95')
      expect(sourceRow.firstElementChild).toHaveClass('invisible')
    })

    fireEvent.dragOver(targetRow, { dataTransfer })
    fireEvent.drop(targetRow, { dataTransfer })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-selection-questions/11/answers/101',
        expect.objectContaining({
          body: JSON.stringify({ sortOrder: 1 }),
          method: 'PUT',
        }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-selection-questions/11/answers/102',
        expect.objectContaining({
          body: JSON.stringify({ sortOrder: 0 }),
          method: 'PUT',
        }),
      )
    })
    expect(state.getQuestion().answers.map(answer => answer.id)).toEqual([
      102, 101,
    ])
    await flushAsyncWork()
    expect(countQuestionListFetches()).toBe(1)
  })

  it('restores the original answer order when a live drag is canceled', async () => {
    const secondAnswer = {
      ...sampleAnswer,
      id: 102,
      requirementIds: [302],
      sortOrder: 1,
      text: 'Enhanced profile',
    }
    setupMutableQuestionAnswers([sampleAnswer, secondAnswer])

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(sampleQuestion.text)).toBeInTheDocument()
    expandQuestion(sampleQuestion.text)
    expect(screen.getByText(sampleAnswer.text)).toBeInTheDocument()
    const sourceRow = screen.getByText(sampleAnswer.text).closest('li')
    const targetRow = screen.getByText(secondAnswer.text).closest('li')
    const answerList = sourceRow?.closest('ul')
    if (!sourceRow || !targetRow || !answerList) {
      throw new Error('Missing draggable answer row')
    }

    const dragHandle = within(sourceRow as HTMLElement).getByRole('button', {
      name: 'Reorder answer',
    })
    const dataTransfer = createDragDataTransfer()
    fireEvent.pointerDown(dragHandle)
    expect(sourceRow).toHaveAttribute('draggable', 'true')
    fireEvent.dragStart(sourceRow, { dataTransfer })
    fireEvent.dragOver(targetRow, { dataTransfer })

    await waitFor(() => {
      const rows = within(answerList as HTMLElement).getAllByRole('listitem')
      expect(rows[0]).toHaveTextContent(secondAnswer.text)
      expect(rows[1]).toHaveTextContent(sampleAnswer.text)
      expect(rows[0]).toHaveClass('bg-secondary-100/95')
    })

    fireEvent.dragEnd(sourceRow, { dataTransfer })

    await waitFor(() => {
      const rows = within(answerList as HTMLElement).getAllByRole('listitem')
      expect(rows[0]).toHaveTextContent(sampleAnswer.text)
      expect(rows[1]).toHaveTextContent(secondAnswer.text)
      expect(rows[0]).not.toHaveClass('bg-secondary-200/95')
      expect(rows[0]).not.toHaveClass('bg-secondary-100/95')
      expect(rows[0]?.firstElementChild).not.toHaveClass('invisible')
    })
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).includes(
            '/api/requirement-selection-questions/11/answers/',
          ) && init?.method === 'PUT',
      ),
    ).toBe(false)
  })

  it('reorders answers from the handle with keyboard arrows', async () => {
    const secondAnswer = {
      ...sampleAnswer,
      id: 102,
      requirementIds: [302],
      sortOrder: 1,
      text: 'Enhanced profile',
    }
    const state = setupMutableQuestionAnswers([sampleAnswer, secondAnswer])

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(sampleQuestion.text)).toBeInTheDocument()
    expandQuestion(sampleQuestion.text)
    expect(screen.getByText(secondAnswer.text)).toBeInTheDocument()
    const secondAnswerCard = getAnswerCard(secondAnswer.text)

    fireEvent.keyDown(
      within(secondAnswerCard as HTMLElement).getByRole('button', {
        name: 'Reorder answer',
      }),
      { key: 'ArrowUp' },
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-selection-questions/11/answers/101',
        expect.objectContaining({
          body: JSON.stringify({ sortOrder: 1 }),
          method: 'PUT',
        }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-selection-questions/11/answers/102',
        expect.objectContaining({
          body: JSON.stringify({ sortOrder: 0 }),
          method: 'PUT',
        }),
      )
    })
    expect(state.getQuestion().answers.map(answer => answer.id)).toEqual([
      102, 101,
    ])
  })

  it('keeps answer action controls at 44px minimum touch targets', async () => {
    const questions = [{ ...sampleQuestion, answers: [sampleAnswer] }]

    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-areas') {
        return okJson({ areas: [sampleArea] })
      }
      if (url === '/api/requirement-packages') {
        return okJson({ requirementPackages: [samplePackage] })
      }
      if (url === '/api/requirement-selection-questions?includeArchived=true') {
        return okJson({ questions })
      }
      return okJson({})
    })

    render(<RequirementSelectionQuestionsClient />)

    expect(await screen.findByText(sampleQuestion.text)).toBeInTheDocument()
    const questionCard = expandQuestion(sampleQuestion.text)
    expect(screen.getByText(sampleAnswer.text)).toBeInTheDocument()
    const answerCard = getAnswerCard(sampleAnswer.text)
    const sourceGroup = within(answerCard).getByRole('group', {
      name: 'Requirement selection sources',
    })
    const sourceButtons = within(sourceGroup).getAllByRole('button')
    expect(sourceButtons[0]).toHaveAttribute(
      'aria-label',
      'Show requirements in selection for Baseline profile',
    )
    expect(
      sourceGroup.querySelector('[data-answer-source-separator="true"]'),
    ).toBeInTheDocument()

    expect(
      within(answerCard).getByRole('button', {
        name: 'Reorder answer',
      }),
    ).toHaveClass('min-h-11', 'w-8', 'text-secondary-700')

    expect(
      within(answerCard).queryByRole('button', {
        name: 'Requirements in selection: 1',
      }),
    ).not.toBeInTheDocument()
    expect(
      within(answerCard).getByRole('button', {
        name: 'Filter requirements by requirement package Baseline',
      }),
    ).toHaveClass('min-h-7', 'rounded-full')
    expect(
      within(answerCard).getByRole('button', {
        name: 'Filter requirements by Requirement ID SEC-001',
      }),
    ).toHaveClass('min-h-7', 'rounded-full', 'font-mono')
    expect(
      within(answerCard).getByRole('button', {
        name: 'Show requirements in selection for Baseline profile',
      }),
    ).toHaveClass('min-h-7', 'rounded-full')

    for (const buttonName of ['Edit', 'Deactivate', 'Archive', 'Delete']) {
      const actionButton = within(answerCard).getByRole('button', {
        name: buttonName,
      })

      expect(actionButton).toHaveClass('min-h-11', 'min-w-11', 'gap-1.5')
      expect(actionButton.querySelector('svg[aria-hidden="true"]')).toBeTruthy()
    }

    expect(
      within(questionCard).getByRole('button', {
        name: 'Add answer',
      }),
    ).toHaveClass('min-h-11', 'min-w-11')
  })
})
