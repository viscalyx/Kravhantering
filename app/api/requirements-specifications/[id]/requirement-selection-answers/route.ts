import { NextResponse } from 'next/server'
import { listSpecificationRequirementSelectionQuestions } from '@/lib/dal/requirement-selection-questions'
import { getSpecificationById } from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { idParamSchema, parseRouteParams } from '@/lib/http/validation'

type Params = Promise<{ id: string }>

const paramsSchema = idParamSchema

export async function GET(_request: Request, { params }: { params: Params }) {
  const parsedParams = await parseRouteParams(params, paramsSchema)
  if (!parsedParams.ok) return parsedParams.response
  const db = await getRequestSqlServerDataSource()
  const specification = await getSpecificationById(db, parsedParams.data.id)
  if (!specification) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const questions = await listSpecificationRequirementSelectionQuestions(
    db,
    specification.id,
  )
  return NextResponse.json({ questions })
}
