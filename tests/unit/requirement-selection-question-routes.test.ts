import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  conflictError,
  forbiddenError,
  notFoundError,
} from '@/lib/requirements/errors'

const mocks = vi.hoisted(() => {
  const context = {
    actor: {
      displayName: 'Selection Steward',
      hsaId: 'SE5560000001-steward',
      id: 'selection-steward',
      isAuthenticated: true,
      roles: ['RequirementsEditor'],
      source: 'oidc',
    },
    correlationId: 'selection-correlation',
    requestId: 'selection-request',
    source: 'rest',
  }
  const db = { query: vi.fn() }

  return {
    assertAuthorized: vi.fn(),
    context,
    createRequirementSelectionAnswer: vi.fn(),
    createRequirementSelectionQuestion: vi.fn(),
    db,
    deleteRequirementSelectionAnswer: vi.fn(),
    deleteRequirementSelectionQuestion: vi.fn(),
    duplicateRequirementSelectionQuestion: vi.fn(),
    getRequirementSelectionQuestionById: vi.fn(),
    getRequirementSelectionQuestionByIdentifier: vi.fn(),
    getRequestSqlServerDataSource: vi.fn(async () => db),
    getSpecificationById: vi.fn(),
    listRequirementSelectionQuestions: vi.fn(),
    recordAllowedActionAuditEvent: vi.fn(),
    recordDeniedActionAuditEvent: vi.fn(),
    replaceSavedAnswers: vi.fn(),
    replaceRequirementSelectionQuestionVisibilityGroups: vi.fn(),
    replaceSpecificationRequirementSelectionAnswers: vi.fn(),
    resolveRequirementSelectionQuestionId: vi.fn(),
    setRequirementSelectionAnswerState: vi.fn(),
    setRequirementSelectionQuestionState: vi.fn(),
    updateRequirementSelectionAnswer: vi.fn(),
    updateRequirementSelectionQuestion: vi.fn(),
  }
})

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mocks.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/requirements/auth', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/requirements/auth')>()
  return {
    ...actual,
    createDefaultAuthorizationService: () => ({
      assertAuthorized: mocks.assertAuthorized,
    }),
    createRequestContext: vi.fn(async () => mocks.context),
  }
})

vi.mock('@/lib/audit/action-audit', () => ({
  recordAllowedActionAuditEvent: mocks.recordAllowedActionAuditEvent,
  recordDeniedActionAuditEvent: mocks.recordDeniedActionAuditEvent,
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  getSpecificationById: mocks.getSpecificationById,
}))

vi.mock('@/lib/dal/requirement-selection-questions', () => ({
  createRequirementSelectionAnswer: mocks.createRequirementSelectionAnswer,
  createRequirementSelectionQuestion: mocks.createRequirementSelectionQuestion,
  deleteRequirementSelectionAnswer: mocks.deleteRequirementSelectionAnswer,
  deleteRequirementSelectionQuestion: mocks.deleteRequirementSelectionQuestion,
  duplicateRequirementSelectionQuestion:
    mocks.duplicateRequirementSelectionQuestion,
  getRequirementSelectionQuestionById:
    mocks.getRequirementSelectionQuestionById,
  getRequirementSelectionQuestionByIdentifier:
    mocks.getRequirementSelectionQuestionByIdentifier,
  listRequirementSelectionQuestions: mocks.listRequirementSelectionQuestions,
  replaceRequirementSelectionQuestionVisibilityGroups:
    mocks.replaceRequirementSelectionQuestionVisibilityGroups,
  replaceSpecificationRequirementSelectionAnswers:
    mocks.replaceSpecificationRequirementSelectionAnswers,
  resolveRequirementSelectionQuestionId:
    mocks.resolveRequirementSelectionQuestionId,
  setRequirementSelectionAnswerState: mocks.setRequirementSelectionAnswerState,
  setRequirementSelectionQuestionState:
    mocks.setRequirementSelectionQuestionState,
  updateRequirementSelectionAnswer: mocks.updateRequirementSelectionAnswer,
  updateRequirementSelectionQuestion: mocks.updateRequirementSelectionQuestion,
}))

vi.mock(
  '@/lib/requirements/specification-requirement-selection-answer-mutations',
  () => ({
    createSpecificationRequirementSelectionAnswerMutationWorkflow: () => ({
      replace: mocks.replaceSavedAnswers,
    }),
  }),
)

import { POST as activateQuestion } from '@/app/api/requirement-selection-questions/[id]/activate/route'
import { POST as activateAnswer } from '@/app/api/requirement-selection-questions/[id]/answers/[answerId]/activate/route'
import { POST as archiveAnswer } from '@/app/api/requirement-selection-questions/[id]/answers/[answerId]/archive/route'
import { POST as deactivateAnswer } from '@/app/api/requirement-selection-questions/[id]/answers/[answerId]/deactivate/route'
import { POST as reactivateAnswer } from '@/app/api/requirement-selection-questions/[id]/answers/[answerId]/reactivate/route'
import {
  DELETE as deleteAnswer,
  PUT as updateAnswer,
} from '@/app/api/requirement-selection-questions/[id]/answers/[answerId]/route'
import { POST as createAnswer } from '@/app/api/requirement-selection-questions/[id]/answers/route'
import { POST as archiveQuestion } from '@/app/api/requirement-selection-questions/[id]/archive/route'
import { POST as deactivateQuestion } from '@/app/api/requirement-selection-questions/[id]/deactivate/route'
import { POST as duplicateQuestion } from '@/app/api/requirement-selection-questions/[id]/duplicate/route'
import { POST as reactivateQuestion } from '@/app/api/requirement-selection-questions/[id]/reactivate/route'
import {
  DELETE as deleteQuestion,
  GET as getQuestion,
  PUT as updateQuestion,
} from '@/app/api/requirement-selection-questions/[id]/route'
import { PUT as updateVisibility } from '@/app/api/requirement-selection-questions/[id]/visibility/route'
import {
  POST as createQuestion,
  GET as listQuestions,
} from '@/app/api/requirement-selection-questions/route'
import { PUT as replaceSpecificationAnswers } from '@/app/api/requirements-specifications/[id]/requirement-selection-answers/[questionId]/route'

const question = {
  areaId: 5,
  id: 11,
  questionCode: 'INF-SQ001',
  selectionType: 'single',
  text: 'Which controls apply?',
}

function request(path: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      body === undefined ? undefined : { 'Content-Type': 'application/json' },
    method,
  })
}

function questionParams(id = '11') {
  return { params: Promise.resolve({ id }) }
}

function answerParams(id = '11', answerId = '101') {
  return { params: Promise.resolve({ answerId, id }) }
}

describe('requirement selection question routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.context.actor.displayName = 'Selection Steward'
    mocks.context.actor.id = 'selection-steward'
    mocks.createRequirementSelectionAnswer.mockResolvedValue(question)
    mocks.createRequirementSelectionQuestion.mockResolvedValue(question)
    mocks.deleteRequirementSelectionAnswer.mockResolvedValue('deleted')
    mocks.deleteRequirementSelectionQuestion.mockResolvedValue('deleted')
    mocks.duplicateRequirementSelectionQuestion.mockResolvedValue({
      ...question,
      id: 12,
      questionCode: 'INF-SQ002',
    })
    mocks.getRequirementSelectionQuestionById.mockResolvedValue(question)
    mocks.getRequirementSelectionQuestionByIdentifier.mockResolvedValue(
      question,
    )
    mocks.getSpecificationById.mockResolvedValue({ id: 7 })
    mocks.listRequirementSelectionQuestions.mockResolvedValue([question])
    mocks.recordAllowedActionAuditEvent.mockResolvedValue(undefined)
    mocks.recordDeniedActionAuditEvent.mockResolvedValue(undefined)
    mocks.replaceRequirementSelectionQuestionVisibilityGroups.mockResolvedValue(
      question,
    )
    mocks.replaceSpecificationRequirementSelectionAnswers.mockResolvedValue([
      question,
    ])
    mocks.replaceSavedAnswers.mockResolvedValue([question])
    mocks.resolveRequirementSelectionQuestionId.mockResolvedValue(11)
    mocks.setRequirementSelectionAnswerState.mockResolvedValue(question)
    mocks.setRequirementSelectionQuestionState.mockResolvedValue(question)
    mocks.updateRequirementSelectionAnswer.mockResolvedValue(question)
    mocks.updateRequirementSelectionQuestion.mockResolvedValue(question)
  })

  it('lists filtered questions and creates a question with an audit event', async () => {
    const listResponse = await listQuestions(
      request(
        '/api/requirement-selection-questions?areaId=5&includeArchived=false',
      ),
    )
    expect(listResponse.status).toBe(200)
    await expect(listResponse.json()).resolves.toEqual({
      questions: [question],
    })
    expect(mocks.listRequirementSelectionQuestions).toHaveBeenCalledWith(
      mocks.db,
      { areaId: 5, includeArchived: false },
    )

    const createResponse = await createQuestion(
      request('/api/requirement-selection-questions', 'POST', {
        areaId: 5,
        selectionType: 'single',
        text: 'Which controls apply?',
      }),
    )
    expect(createResponse.status).toBe(201)
    await expect(createResponse.json()).resolves.toEqual(question)
    expect(mocks.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      mocks.db,
      mocks.context,
      expect.objectContaining({
        action: 'requirement_selection_question.create',
        targetUniqueId: 'INF-SQ001',
      }),
    )
  })

  it('returns a question by stable identifier and rejects invalid or missing identifiers', async () => {
    const response = await getQuestion(
      request('/api/requirement-selection-questions/INF-SQ001'),
      questionParams('INF-SQ001'),
    )
    await expect(response.json()).resolves.toEqual({ question })

    const invalid = await getQuestion(
      request('/api/requirement-selection-questions/0'),
      questionParams('0'),
    )
    expect(invalid.status).toBe(400)

    mocks.getRequirementSelectionQuestionByIdentifier.mockResolvedValueOnce(
      null,
    )
    const missing = await getQuestion(
      request('/api/requirement-selection-questions/99'),
      questionParams('99'),
    )
    expect(missing.status).toBe(404)
  })

  it('updates, duplicates, and deletes questions through observable responses', async () => {
    const updateResponse = await updateQuestion(
      request('/api/requirement-selection-questions/11', 'PUT', {
        helpText: 'Choose every applicable control.',
        text: 'Which controls apply?',
      }),
      questionParams(),
    )
    expect(updateResponse.status).toBe(200)
    await expect(updateResponse.json()).resolves.toEqual(question)
    expect(mocks.updateRequirementSelectionQuestion).toHaveBeenCalledWith(
      mocks.db,
      11,
      {
        helpText: 'Choose every applicable control.',
        text: 'Which controls apply?',
      },
    )
    expect(mocks.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      mocks.db,
      mocks.context,
      expect.objectContaining({
        action: 'requirement_selection_question.update',
        targetId: 11,
        targetUniqueId: 'INF-SQ001',
      }),
    )

    const duplicateResponse = await duplicateQuestion(
      request('/api/requirement-selection-questions/11/duplicate', 'POST'),
      questionParams(),
    )
    expect(duplicateResponse.status).toBe(201)
    await expect(duplicateResponse.json()).resolves.toEqual({
      ...question,
      id: 12,
      questionCode: 'INF-SQ002',
    })
    expect(mocks.duplicateRequirementSelectionQuestion).toHaveBeenCalledWith(
      mocks.db,
      11,
    )
    expect(mocks.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      mocks.db,
      mocks.context,
      expect.objectContaining({
        action: 'requirement_selection_question.duplicate',
        details: { sourceQuestionId: 11 },
        targetId: 12,
        targetUniqueId: 'INF-SQ002',
      }),
    )

    const deleteResponse = await deleteQuestion(
      request('/api/requirement-selection-questions/11', 'DELETE'),
      questionParams(),
    )
    await expect(deleteResponse.json()).resolves.toEqual({ ok: true })
  })

  it('returns not found when question mutations cannot resolve or update a row', async () => {
    mocks.resolveRequirementSelectionQuestionId.mockResolvedValueOnce(null)
    const unresolvedUpdate = await updateQuestion(
      request('/api/requirement-selection-questions/missing', 'PUT', {
        text: 'Missing question',
      }),
      questionParams('missing'),
    )
    expect(unresolvedUpdate.status).toBe(404)

    mocks.updateRequirementSelectionQuestion.mockResolvedValueOnce(null)
    const missingUpdate = await updateQuestion(
      request('/api/requirement-selection-questions/11', 'PUT', {
        text: 'Missing question',
      }),
      questionParams(),
    )
    expect(missingUpdate.status).toBe(404)

    mocks.resolveRequirementSelectionQuestionId.mockResolvedValueOnce(null)
    const unresolvedDelete = await deleteQuestion(
      request('/api/requirement-selection-questions/missing', 'DELETE'),
      questionParams('missing'),
    )
    expect(unresolvedDelete.status).toBe(404)
  })

  it.each([
    ['not_found', 404, 'Not found'],
    ['in_use', 409, 'Requirement selection question is in use'],
  ] as const)(
    'maps the %s question deletion outcome to %i',
    async (outcome, status, error) => {
      mocks.deleteRequirementSelectionQuestion.mockResolvedValueOnce(outcome)

      const response = await deleteQuestion(
        request('/api/requirement-selection-questions/11', 'DELETE'),
        questionParams(),
      )

      expect(response.status).toBe(status)
      await expect(response.json()).resolves.toEqual({ error })
    },
  )

  it.each([
    ['activate', activateQuestion],
    ['archive', archiveQuestion],
    ['deactivate', deactivateQuestion],
    ['reactivate', reactivateQuestion],
  ] as const)(
    'applies the %s question lifecycle operation',
    async (operation, route) => {
      const response = await route(
        request(`/api/requirement-selection-questions/11/${operation}`, 'POST'),
        questionParams(),
      )

      expect(response.status).toBe(200)
      expect(mocks.setRequirementSelectionQuestionState).toHaveBeenCalledWith(
        mocks.db,
        11,
        operation,
      )
      expect(mocks.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
        mocks.db,
        mocks.context,
        expect.objectContaining({
          action: `requirement_selection_question.${operation}`,
        }),
      )
    },
  )

  it('returns not found before or after a question lifecycle mutation', async () => {
    mocks.resolveRequirementSelectionQuestionId.mockResolvedValueOnce(null)
    const unresolved = await activateQuestion(
      request('/api/requirement-selection-questions/missing/activate', 'POST'),
      questionParams('missing'),
    )
    expect(unresolved.status).toBe(404)
    expect(mocks.setRequirementSelectionQuestionState).not.toHaveBeenCalled()

    mocks.setRequirementSelectionQuestionState.mockResolvedValueOnce(null)
    const missing = await activateQuestion(
      request('/api/requirement-selection-questions/11/activate', 'POST'),
      questionParams(),
    )
    expect(missing.status).toBe(404)
  })

  it('returns not found when duplication cannot resolve or create a question', async () => {
    mocks.resolveRequirementSelectionQuestionId.mockResolvedValueOnce(null)
    const unresolved = await duplicateQuestion(
      request('/api/requirement-selection-questions/missing/duplicate', 'POST'),
      questionParams('missing'),
    )
    expect(unresolved.status).toBe(404)

    mocks.duplicateRequirementSelectionQuestion.mockResolvedValueOnce(null)
    const missing = await duplicateQuestion(
      request('/api/requirement-selection-questions/11/duplicate', 'POST'),
      questionParams(),
    )
    expect(missing.status).toBe(404)
  })

  it('creates, updates, and deletes answer choices with audit evidence', async () => {
    const createResponse = await createAnswer(
      request('/api/requirement-selection-questions/11/answers', 'POST', {
        packageIds: [4],
        requirementIds: [8],
        text: 'Encryption',
      }),
      questionParams(),
    )
    expect(createResponse.status).toBe(201)
    await expect(createResponse.json()).resolves.toEqual(question)
    expect(mocks.createRequirementSelectionAnswer).toHaveBeenCalledWith(
      mocks.db,
      11,
      {
        packageIds: [4],
        requirementIds: [8],
        text: 'Encryption',
      },
    )
    expect(mocks.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      mocks.db,
      mocks.context,
      expect.objectContaining({
        action: 'requirement_selection_answer.create',
        details: { questionId: 11 },
        targetUniqueId: 'INF-SQ001',
      }),
    )

    const updateResponse = await updateAnswer(
      request('/api/requirement-selection-questions/11/answers/101', 'PUT', {
        description: 'Encryption at rest and in transit',
        text: 'Encryption controls',
      }),
      answerParams(),
    )
    expect(updateResponse.status).toBe(200)
    await expect(updateResponse.json()).resolves.toEqual(question)
    expect(mocks.updateRequirementSelectionAnswer).toHaveBeenCalledWith(
      mocks.db,
      11,
      101,
      {
        description: 'Encryption at rest and in transit',
        text: 'Encryption controls',
      },
    )
    expect(mocks.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      mocks.db,
      mocks.context,
      expect.objectContaining({
        action: 'requirement_selection_answer.update',
        details: {
          answerId: 101,
          changedFields: ['description', 'text'],
          questionId: 11,
        },
        targetId: 101,
      }),
    )

    const deleteResponse = await deleteAnswer(
      request('/api/requirement-selection-questions/11/answers/101', 'DELETE'),
      answerParams(),
    )
    await expect(deleteResponse.json()).resolves.toEqual({ ok: true })
    expect(mocks.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      mocks.db,
      mocks.context,
      expect.objectContaining({
        action: 'requirement_selection_answer.delete',
        targetId: 101,
      }),
    )
  })

  it.each([
    ['not_found', 404, 'Not found'],
    ['in_use', 409, 'Requirement selection answer is in use'],
  ] as const)(
    'maps the %s answer deletion outcome to %i',
    async (outcome, status, error) => {
      mocks.deleteRequirementSelectionAnswer.mockResolvedValueOnce(outcome)
      const response = await deleteAnswer(
        request(
          '/api/requirement-selection-questions/11/answers/101',
          'DELETE',
        ),
        answerParams(),
      )
      expect(response.status).toBe(status)
      await expect(response.json()).resolves.toEqual({ error })
    },
  )

  it.each([
    ['activate', activateAnswer],
    ['archive', archiveAnswer],
    ['deactivate', deactivateAnswer],
    ['reactivate', reactivateAnswer],
  ] as const)(
    'applies the %s answer lifecycle operation',
    async (operation, route) => {
      const response = await route(
        request(
          `/api/requirement-selection-questions/11/answers/101/${operation}`,
          'POST',
        ),
        answerParams(),
      )
      expect(response.status).toBe(200)
      expect(mocks.setRequirementSelectionAnswerState).toHaveBeenCalledWith(
        mocks.db,
        11,
        101,
        operation,
      )
    },
  )

  it('returns not found for unresolved and missing answer mutations', async () => {
    mocks.resolveRequirementSelectionQuestionId.mockResolvedValueOnce(null)
    const unresolved = await createAnswer(
      request('/api/requirement-selection-questions/missing/answers', 'POST', {
        text: 'Encryption',
      }),
      questionParams('missing'),
    )
    expect(unresolved.status).toBe(404)

    mocks.updateRequirementSelectionAnswer.mockResolvedValueOnce(null)
    const missing = await updateAnswer(
      request('/api/requirement-selection-questions/11/answers/101', 'PUT', {
        text: 'Missing answer',
      }),
      answerParams(),
    )
    expect(missing.status).toBe(404)
  })

  it('returns not found for every answer mutation boundary', async () => {
    mocks.createRequirementSelectionAnswer.mockResolvedValueOnce(null)
    const missingCreate = await createAnswer(
      request('/api/requirement-selection-questions/11/answers', 'POST', {
        text: 'Missing answer',
      }),
      questionParams(),
    )
    expect(missingCreate.status).toBe(404)

    mocks.resolveRequirementSelectionQuestionId.mockResolvedValueOnce(null)
    const unresolvedUpdate = await updateAnswer(
      request(
        '/api/requirement-selection-questions/missing/answers/101',
        'PUT',
        {
          text: 'Missing answer',
        },
      ),
      answerParams('missing'),
    )
    expect(unresolvedUpdate.status).toBe(404)

    mocks.resolveRequirementSelectionQuestionId.mockResolvedValueOnce(null)
    const unresolvedDelete = await deleteAnswer(
      request(
        '/api/requirement-selection-questions/missing/answers/101',
        'DELETE',
      ),
      answerParams('missing'),
    )
    expect(unresolvedDelete.status).toBe(404)

    mocks.resolveRequirementSelectionQuestionId.mockResolvedValueOnce(null)
    const unresolvedState = await activateAnswer(
      request(
        '/api/requirement-selection-questions/missing/answers/101/activate',
        'POST',
      ),
      answerParams('missing'),
    )
    expect(unresolvedState.status).toBe(404)

    mocks.setRequirementSelectionAnswerState.mockResolvedValueOnce(null)
    const missingState = await activateAnswer(
      request(
        '/api/requirement-selection-questions/11/answers/101/activate',
        'POST',
      ),
      answerParams(),
    )
    expect(missingState.status).toBe(404)
  })

  it('replaces visibility groups and returns the refreshed hierarchy', async () => {
    const groups = [
      {
        conditions: [{ answerIds: [101], parentQuestionId: 10 }],
      },
    ]
    const refreshed = { ...question, visibilityGroups: groups }
    mocks.getRequirementSelectionQuestionById.mockResolvedValueOnce(refreshed)

    const response = await updateVisibility(
      request('/api/requirement-selection-questions/11/visibility', 'PUT', {
        groups,
      }),
      questionParams(),
    )

    await expect(response.json()).resolves.toEqual(refreshed)
    expect(
      mocks.replaceRequirementSelectionQuestionVisibilityGroups,
    ).toHaveBeenCalledWith(mocks.db, 11, groups)
  })

  it('returns the updated question when refreshing visibility finds no row', async () => {
    mocks.getRequirementSelectionQuestionById.mockResolvedValueOnce(null)
    const response = await updateVisibility(
      request('/api/requirement-selection-questions/11/visibility', 'PUT', {
        groups: [],
      }),
      questionParams(),
    )
    await expect(response.json()).resolves.toEqual(question)
  })

  it('returns not found when visibility cannot resolve or update a question', async () => {
    mocks.resolveRequirementSelectionQuestionId.mockResolvedValueOnce(null)
    const unresolved = await updateVisibility(
      request(
        '/api/requirement-selection-questions/missing/visibility',
        'PUT',
        {
          groups: [],
        },
      ),
      questionParams('missing'),
    )
    expect(unresolved.status).toBe(404)

    mocks.replaceRequirementSelectionQuestionVisibilityGroups.mockResolvedValueOnce(
      null,
    )
    const missing = await updateVisibility(
      request('/api/requirement-selection-questions/11/visibility', 'PUT', {
        groups: [],
      }),
      questionParams(),
    )
    expect(missing.status).toBe(404)
  })

  it('delegates saved-answer replacement to the authorized domain workflow', async () => {
    const response = await replaceSpecificationAnswers(
      request(
        '/api/requirements-specifications/7/requirement-selection-answers/11',
        'PUT',
        { answerIds: [101, 102] },
      ),
      { params: Promise.resolve({ id: '7', questionId: '11' }) },
    )

    expect(response.status).toBe(200)
    expect(mocks.assertAuthorized).toHaveBeenCalledWith(
      {
        kind: 'manage_specification_requirement_selection_answers',
        operation: 'replace',
        specificationId: 7,
      },
      mocks.context,
    )
    await expect(response.json()).resolves.toEqual({ questions: [question] })
    expect(mocks.replaceSavedAnswers).toHaveBeenCalledWith(mocks.context, {
      answerIds: [101, 102],
      confirmHiddenAnswerClear: undefined,
      questionId: 11,
      specificationId: 7,
    })
  })

  it('denies saved-answer replacement before specification or answer work', async () => {
    mocks.assertAuthorized.mockRejectedValueOnce(
      forbiddenError('Specification author assignment is required', {
        reason: 'specification_author_required',
      }),
    )

    const response = await replaceSpecificationAnswers(
      request(
        '/api/requirements-specifications/7/requirement-selection-answers/11',
        'PUT',
        { answerIds: [101] },
      ),
      { params: Promise.resolve({ id: '7', questionId: '11' }) },
    )

    expect(response.status).toBe(403)
    expect(mocks.recordDeniedActionAuditEvent).toHaveBeenCalledWith(
      mocks.db,
      mocks.context,
      expect.objectContaining({
        action: 'requirements.authorization.denied',
        denialReason: 'specification_author_required',
        targetKind: 'requirements',
      }),
    )
    expect(mocks.replaceSavedAnswers).not.toHaveBeenCalled()
  })

  it('returns hidden selections for the confirmation conflict', async () => {
    mocks.replaceSavedAnswers.mockRejectedValueOnce(
      conflictError('Confirm clearing hidden answers', {
        hiddenSelections: [{ answerId: 101, questionId: 11 }],
        reason: 'hidden_selection_clear_required',
      }),
    )

    const response = await replaceSpecificationAnswers(
      request(
        '/api/requirements-specifications/7/requirement-selection-answers/11',
        'PUT',
        { answerIds: [] },
      ),
      { params: Promise.resolve({ id: '7', questionId: '11' }) },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      code: 'conflict',
      error: 'Confirm clearing hidden answers',
      hiddenSelections: [{ answerId: 101, questionId: 11 }],
      reason: 'hidden_selection_clear_required',
    })
  })

  it('returns an empty hidden-selection list when the conflict has no details', async () => {
    mocks.replaceSavedAnswers.mockRejectedValueOnce(
      conflictError('Confirm clearing hidden answers', {
        reason: 'hidden_selection_clear_required',
      }),
    )
    const response = await replaceSpecificationAnswers(
      request(
        '/api/requirements-specifications/7/requirement-selection-answers/11',
        'PUT',
        { answerIds: [] },
      ),
      { params: Promise.resolve({ id: '7', questionId: '11' }) },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      hiddenSelections: [],
    })
  })

  it('returns not found when the domain workflow cannot resolve the specification', async () => {
    mocks.replaceSavedAnswers.mockRejectedValueOnce(
      notFoundError('Requirements specification not found'),
    )
    const missing = await replaceSpecificationAnswers(
      request(
        '/api/requirements-specifications/99/requirement-selection-answers/11',
        'PUT',
        { answerIds: [] },
      ),
      { params: Promise.resolve({ id: '99', questionId: '11' }) },
    )
    expect(missing.status).toBe(404)
  })

  it('sanitizes unexpected specification answer replacement failures', async () => {
    mocks.replaceSavedAnswers.mockRejectedValueOnce(
      new Error('database detail'),
    )
    const response = await replaceSpecificationAnswers(
      request(
        '/api/requirements-specifications/7/requirement-selection-answers/11',
        'PUT',
        { answerIds: [] },
      ),
      { params: Promise.resolve({ id: '7', questionId: '11' }) },
    )
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to process mutation',
    })
  })
})
