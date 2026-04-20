import { NextResponse } from 'next/server'
import {
  countLinkedRequirements,
  createRiskLevel,
  listRiskLevels,
} from '@/lib/dal/risk-levels'
import { getRequestDatabaseConnection } from '@/lib/db'

export async function GET() {
  const db = await getRequestDatabaseConnection()
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
  let body: Parameters<typeof createRiskLevel>[1]

  try {
    body = (await request.json()) as Parameters<typeof createRiskLevel>[1]
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error instanceof Error && error.message.includes('JSON'))
    ) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const db = await getRequestDatabaseConnection()
    const riskLevel = await createRiskLevel(db, body)
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
