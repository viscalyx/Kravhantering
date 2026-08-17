import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import { listAreaIdsActorCanAuthor } from '@/lib/dal/requirement-areas'
import {
  createRequirementSelectionQuestion,
  listRequirementSelectionQuestions,
} from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { secureMutationRoute } from '@/lib/http/secure-mutation-route'
import {
  positiveIntegerStringSchema,
  queryBooleanSchema,
} from '@/lib/http/validation'
import { createRequestContext } from '@/lib/requirements/auth'
import { requirementSelectionQuestionCreatePolicy } from './_authorization'
import { questionCreateSchema } from './_schemas'

const querySchema = z
  .object({
    areaId: positiveIntegerStringSchema.optional(),
    includeArchived: queryBooleanSchema.optional().default(true),
  })
  .passthrough()

export async function GET(request: Request) {
  const db = await getRequestSqlServerDataSource()
  const context = await createRequestContext(request, 'rest')
  const query = querySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  )
  const questions = await listRequirementSelectionQuestions(db, {
    areaId: query.areaId,
    includeArchived: query.includeArchived,
  })
  const isAdmin = context.actor.roles.includes('Admin')
  const authoredAreaIds = isAdmin
    ? null
    : new Set(await listAreaIdsActorCanAuthor(db, context.actor.hsaId))
  return NextResponse.json({
    questions: questions.map(question => ({
      ...question,
      permissions: {
        canManage: isAdmin || authoredAreaIds?.has(question.areaId) === true,
      },
    })),
  })
}

export const POST = secureMutationRoute({
  bodySchema: questionCreateSchema,
  policy: requirementSelectionQuestionCreatePolicy(),
  handler: async ({ body, context, db }) => {
    const activeDb = db ?? (await getRequestSqlServerDataSource())
    const question = await createRequirementSelectionQuestion(activeDb, body)
    await recordAllowedActionAuditEvent(activeDb, context, {
      action: 'requirement_selection_question.create',
      details: {
        areaId: question.areaId,
        selectionType: question.selectionType,
      },
      targetId: question.id,
      targetKind: 'requirement_selection_question',
      targetUniqueId: question.questionCode,
    })
    return NextResponse.json(question, { status: 201 })
  },
})
