import { NextResponse } from 'next/server'
import {
  countLinkedRequirements,
  createScenario,
  listScenarios,
} from '@/lib/dal/usage-scenarios'
import { getRequestSqlServerDataSource } from '@/lib/db'

export async function GET() {
  const db = await getRequestSqlServerDataSource()
  const [scenarios, counts] = await Promise.all([
    listScenarios(db),
    countLinkedRequirements(db),
  ])
  return NextResponse.json({
    scenarios: scenarios.map(s => ({
      ...s,
      linkedRequirementCount: counts[s.id] ?? 0,
    })),
  })
}

export async function POST(request: Request) {
  const db = await getRequestSqlServerDataSource()
  const body = (await request.json()) as Parameters<typeof createScenario>[1]
  const scenario = await createScenario(db, body)
  return NextResponse.json(scenario, { status: 201 })
}
