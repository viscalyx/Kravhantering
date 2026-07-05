import { NextResponse } from 'next/server'
import { listSpecificationRequirementSelectionQuestions } from '@/lib/dal/requirement-selection-questions'
import { getSpecificationById } from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import { idParamSchema, parseRouteParams } from '@/lib/http/validation'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { authorize } from '@/lib/requirements/service-shared'

type Params = Promise<{ id: string }>

const paramsSchema = idParamSchema

export async function GET(request: Request, { params }: { params: Params }) {
  const parsedParams = await parseRouteParams(params, paramsSchema)
  if (!parsedParams.ok) return parsedParams.response
  try {
    const db = await getRequestSqlServerDataSource()
    const specification = await getSpecificationById(db, parsedParams.data.id)
    if (!specification) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const runtime = await createRequirementsRestRuntime(request, { db })
    await authorize(
      runtime.authorization,
      {
        kind: 'get_specification_items',
        specificationId: specification.id,
      },
      runtime.context,
    )
    const questions = await listSpecificationRequirementSelectionQuestions(
      db,
      specification.id,
    )
    return NextResponse.json({ questions })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    if (status >= 500) {
      logSanitizedError(
        '[API] Failed to list requirement selection answers for specification',
        error,
        { specificationId: parsedParams.data.id },
      )
    }
    return NextResponse.json(body, { status })
  }
}
