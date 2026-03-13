import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'
import { createScenario, listScenarios } from '@/lib/dal/requirement-scenarios'
import { getDb } from '@/lib/db'

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const scenarios = await listScenarios(db)
  return NextResponse.json({ scenarios })
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const body = (await request.json()) as Parameters<typeof createScenario>[1]
  const scenario = await createScenario(db, body)
  return NextResponse.json(scenario, { status: 201 })
}
