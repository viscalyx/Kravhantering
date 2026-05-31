import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAllowedActionAuditEvent } from '@/lib/audit/action-audit'
import {
  createRequirementSelectionQuestion,
  listRequirementSelectionQuestions,
} from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  positiveIntegerStringSchema,
  queryBooleanSchema,
} from '@/lib/http/validation'
import { questionCreateSchema } from './_schemas'

const querySchema = z
  .object({
    areaId: positiveIntegerStringSchema.optional(),
    includeArchived: queryBooleanSchema.optional().default(true),
  })
  .passthrough()

export async function GET(request: Request) {
  const db = await getRequestSqlServerDataSource()
  const query = querySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  )
  const questions = await listRequirementSelectionQuestions(db, {
    areaId: query.areaId,
    includeArchived: query.includeArchived,
  })
  return NextResponse.json({ questions })
}

export const POST = secureMutationRoute({
  bodySchema: questionCreateSchema,
  policy: customMutationPolicy('requirement_selection_question', () => {}),
  handler: async ({ body, context }) => {
    const db = await getRequestSqlServerDataSource()
    const question = await createRequirementSelectionQuestion(db, body)
    await recordAllowedActionAuditEvent(db, context, {
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
