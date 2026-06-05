import { type NextRequest, NextResponse } from 'next/server'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  deleteRequirementSelectionQuestion,
  getRequirementSelectionQuestionByIdentifier,
  resolveRequirementSelectionQuestionId,
  updateRequirementSelectionQuestion,
} from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  authenticatedMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { parseRouteParams } from '@/lib/http/validation'
import { questionRouteParamsSchema, questionUpdateSchema } from '../_schemas'

type Params = Promise<{ id: string }>

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, questionRouteParamsSchema)
  if (!parsedParams.ok) return parsedParams.response
  const db = await getRequestSqlServerDataSource()
  const question = await getRequirementSelectionQuestionByIdentifier(
    db,
    parsedParams.data.id,
  )
  if (!question) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ question })
}

export const PUT = secureMutationRoute({
  bodySchema: questionUpdateSchema,
  paramsSchema: questionRouteParamsSchema,
  policy: authenticatedMutationPolicy('requirement_selection_question.update'),
  handler: async ({ body, context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const questionId = await resolveRequirementSelectionQuestionId(
      db,
      params.id,
    )
    if (questionId == null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const question = await updateRequirementSelectionQuestion(
      db,
      questionId,
      body,
    )
    if (!question) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await recordAllowedActionAuditEvent(db, context, {
      action: 'requirement_selection_question.update',
      details: { changedFields: Object.keys(body) },
      targetId: question.id,
      targetKind: 'requirement_selection_question',
      targetUniqueId: question.questionCode,
    })
    return NextResponse.json(question)
  },
})

export const DELETE = secureMutationRoute({
  paramsSchema: questionRouteParamsSchema,
  policy: authenticatedMutationPolicy('requirement_selection_question.delete'),
  handler: async ({ context, params }) => {
    const db = await getRequestSqlServerDataSource()
    const questionId = await resolveRequirementSelectionQuestionId(
      db,
      params.id,
    )
    if (questionId == null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const result = await deleteRequirementSelectionQuestion(db, questionId)
    if (result === 'not_found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (result === 'in_use') {
      return NextResponse.json(
        { error: 'Requirement selection question is in use' },
        { status: 409 },
      )
    }
    await recordAllowedActionAuditEvent(db, context, {
      action: 'requirement_selection_question.delete',
      targetId: questionId,
      targetKind: 'requirement_selection_question',
    })
    return NextResponse.json({ ok: true })
  },
})
