import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  countLinkedRequirements,
  createRiskLevel,
  listRiskLevels,
} from '@/lib/dal/risk-levels'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  boundedDbStringSchema,
  nonNegativeIntegerSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'

const createRiskLevelSchema = z
  .object({
    color: boundedDbStringSchema,
    nameEn: boundedDbStringSchema,
    nameSv: boundedDbStringSchema,
    sortOrder: nonNegativeIntegerSchema.optional(),
  })
  .strict()

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const [riskLevels, counts] = await Promise.all([
    listRiskLevels(db),
    countLinkedRequirements(db),
  ])
  return NextResponse.json({
    riskLevels: riskLevels.map(r => ({
      ...r,
      linkedRequirementCount: counts[r.id] ?? 0,
    })),
  })
}

export async function POST(request: Request) {
  const parsedBody = await readJsonWithSchema(request, createRiskLevelSchema)
  if (!parsedBody.ok) return parsedBody.response

  try {
    const db = await getRequestSqlServerDataSource()
    const riskLevel = await createRiskLevel(db, parsedBody.data)
    return NextResponse.json(riskLevel, { status: 201 })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal server error'
    const isDuplicate =
      message.includes('UNIQUE') || message.includes('duplicate')
    return NextResponse.json(
      { error: isDuplicate ? 'Duplicate entry' : 'Internal server error' },
      { status: isDuplicate ? 409 : 500 },
    )
  }
}
