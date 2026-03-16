import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import {
  deleteScenario,
  getLinkedRequirements,
  updateScenario,
} from '@/lib/dal/usage-scenarios'
import { getDb } from '@/lib/db'

type Params = Promise<{ id: string }>

export async function GET(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const linkedRequirements = await getLinkedRequirements(db, numericId)
  return NextResponse.json({ linkedRequirements })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const body = (await request.json()) as Parameters<typeof updateScenario>[2]
  const scenario = await updateScenario(db, numericId, body)
  if (!scenario) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(scenario)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  await deleteScenario(db, numericId)
  return NextResponse.json({ ok: true })
}
