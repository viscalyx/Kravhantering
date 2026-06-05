import { NextResponse } from 'next/server'
import { z } from 'zod'
import { listRequirementSelectionMatchedRequirements } from '@/lib/dal/requirement-selection-questions'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  optionalQueryArraySchema,
  parseSearchParams,
  positiveIntegerStringSchema,
} from '@/lib/http/validation'

const matchedRequirementsQuerySchema = z
  .object({
    packageIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    requirementIds: optionalQueryArraySchema(positiveIntegerStringSchema),
  })
  .strict()

export async function GET(request: Request) {
  const parsedQuery = parseSearchParams(
    new URL(request.url).searchParams,
    matchedRequirementsQuerySchema,
  )
  if (!parsedQuery.ok) return parsedQuery.response

  const db = await getRequestSqlServerDataSource()
  const requirements = await listRequirementSelectionMatchedRequirements(db, {
    packageIds: parsedQuery.data.packageIds,
    requirementIds: parsedQuery.data.requirementIds,
  })

  return NextResponse.json({ requirements })
}
