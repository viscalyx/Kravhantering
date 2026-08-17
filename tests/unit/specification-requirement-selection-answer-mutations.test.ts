import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import { DELETED_USER_INTERNAL_NAME } from '@/lib/privacy/display-name'
import type {
  AuthorizationService,
  RequestContext,
} from '@/lib/requirements/auth'
import { forbiddenError } from '@/lib/requirements/errors'

const mocks = vi.hoisted(() => ({
  findSpecificationIdentity: vi.fn(),
  listAnswers: vi.fn(),
  recordAllowedActionAuditEvent: vi.fn(),
  recordAuthorizationDenied: vi.fn(),
  replaceAnswers: vi.fn(),
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  findSpecificationIdentity: mocks.findSpecificationIdentity,
}))

vi.mock('@/lib/dal/requirement-selection-questions', () => ({
  listSpecificationRequirementSelectionQuestions: mocks.listAnswers,
  replaceSpecificationRequirementSelectionAnswersWithExecutor:
    mocks.replaceAnswers,
}))

vi.mock('@/lib/audit/action-audit', () => ({
  recordAllowedActionAuditEvent: mocks.recordAllowedActionAuditEvent,
}))

vi.mock('@/lib/requirements/security-audit', () => ({
  recordAuthorizationDenied: mocks.recordAuthorizationDenied,
}))

import { createSpecificationRequirementSelectionAnswerMutationWorkflow } from '@/lib/requirements/specification-requirement-selection-answer-mutations'

const context = {
  actor: {
    displayName: '   ',
    hsaId: 'SE5560000001-author1',
    id: 'author-1',
    isAuthenticated: true,
    roles: [],
    source: 'oidc',
  },
  correlationId: 'correlation-1',
  requestId: 'request-1',
  source: 'rest',
} satisfies RequestContext

function makeWorkflow() {
  const manager = { query: vi.fn() }
  const transaction = vi.fn(
    async <T>(callback: (executor: typeof manager) => Promise<T>) =>
      callback(manager),
  )
  const authorization = {
    assertAuthorized: vi.fn(),
  } satisfies AuthorizationService
  return {
    authorization,
    manager,
    transaction,
    workflow: createSpecificationRequirementSelectionAnswerMutationWorkflow({
      authorization,
      db: { transaction } as unknown as SqlServerDatabase,
    }),
  }
}

const input = {
  answerIds: [101, 102],
  questionId: 11,
  specificationId: 7,
}

describe('specification requirement-selection answer mutation workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findSpecificationIdentity.mockResolvedValue({ id: 7 })
    mocks.listAnswers.mockResolvedValue([{ id: 11 }])
    mocks.recordAllowedActionAuditEvent.mockResolvedValue(undefined)
    mocks.replaceAnswers.mockResolvedValue(undefined)
  })

  it('denies before transaction or answer work', async () => {
    const { authorization, transaction, workflow } = makeWorkflow()
    authorization.assertAuthorized.mockRejectedValueOnce(
      forbiddenError('Specification author assignment is required', {
        reason: 'specification_author_required',
      }),
    )

    await expect(workflow.replace(context, input)).rejects.toMatchObject({
      code: 'forbidden',
    })

    expect(transaction).not.toHaveBeenCalled()
    expect(mocks.replaceAnswers).not.toHaveBeenCalled()
    expect(mocks.recordAuthorizationDenied).toHaveBeenCalled()
  })

  it('replaces answers, writes audit evidence, and reads the outcome in one transaction', async () => {
    const { manager, transaction, workflow } = makeWorkflow()

    await expect(workflow.replace(context, input)).resolves.toEqual([
      { id: 11 },
    ])

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(mocks.replaceAnswers).toHaveBeenCalledWith(
      manager,
      7,
      11,
      [101, 102],
      {
        displayName: 'author-1',
        hsaId: 'SE5560000001-author1',
      },
      { confirmHiddenAnswerClear: undefined },
    )
    expect(mocks.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      manager,
      context,
      {
        action: 'specification_requirement_selection_answer.replace',
        details: { answerCount: 2, questionId: 11 },
        targetId: 7,
        targetKind: 'requirements_specification',
      },
    )
    expect(mocks.listAnswers).toHaveBeenCalledWith(manager, 7)
  })

  it('rejects a missing specification before answer work', async () => {
    const { workflow } = makeWorkflow()
    mocks.findSpecificationIdentity.mockResolvedValueOnce(null)

    await expect(workflow.replace(context, input)).rejects.toMatchObject({
      code: 'not_found',
      details: { specificationId: 7 },
    })

    expect(mocks.replaceAnswers).not.toHaveBeenCalled()
    expect(mocks.recordAllowedActionAuditEvent).not.toHaveBeenCalled()
  })

  it.each([
    {
      actor: { ...context.actor, displayName: 'Named Author' },
      expectedDisplayName: 'Named Author',
    },
    {
      actor: { ...context.actor, id: null },
      expectedDisplayName: DELETED_USER_INTERNAL_NAME,
    },
  ])(
    'records the bounded actor display-name fallback $expectedDisplayName',
    async testCase => {
      const { manager, workflow } = makeWorkflow()
      const actorContext = { ...context, actor: testCase.actor }

      await workflow.replace(actorContext, input)

      expect(mocks.replaceAnswers).toHaveBeenCalledWith(
        manager,
        7,
        11,
        [101, 102],
        expect.objectContaining({
          displayName: testCase.expectedDisplayName,
        }),
        expect.anything(),
      )
    },
  )

  it('does not write success audit evidence when answer replacement fails', async () => {
    const { workflow } = makeWorkflow()
    const failure = new Error('answer write failed')
    mocks.replaceAnswers.mockRejectedValueOnce(failure)

    await expect(workflow.replace(context, input)).rejects.toBe(failure)

    expect(mocks.recordAllowedActionAuditEvent).not.toHaveBeenCalled()
    expect(mocks.listAnswers).not.toHaveBeenCalled()
  })

  it('fails the transaction when required success audit evidence fails', async () => {
    const { manager, workflow } = makeWorkflow()
    const failure = new Error('audit write failed')
    mocks.recordAllowedActionAuditEvent.mockRejectedValueOnce(failure)

    await expect(workflow.replace(context, input)).rejects.toBe(failure)

    expect(mocks.replaceAnswers).toHaveBeenCalledWith(
      manager,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    )
    expect(mocks.listAnswers).not.toHaveBeenCalled()
  })
})
