import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  listSpecificationRequirementSelectionQuestions,
  resolveSpecificationId,
} from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  parseRouteParams,
  specificationIdOrSlugSchema,
} from '@/lib/http/validation'

type Params = Promise<{ id: string }>

const paramsSchema = z.object({ id: specificationIdOrSlugSchema }).strict()

export async function GET(_request: Request, { params }: { params: Params }) {
  const parsedParams = await parseRouteParams(params, paramsSchema)
  if (!parsedParams.ok) return parsedParams.response
  const db = await getRequestSqlServerDataSource()
  const specificationId = await resolveSpecificationId(db, parsedParams.data.id)
  if (!specificationId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const questions = await listSpecificationRequirementSelectionQuestions(
    db,
    specificationId,
  )
  return NextResponse.json({ questions })
}
