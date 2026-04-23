import { type NextRequest, NextResponse } from 'next/server'
import {
  deleteRiskLevel,
  getLinkedRequirements,
  getRiskLevelById,
  updateRiskLevel,
} from '@/lib/dal/risk-levels'
import { getRequestSqlServerDataSource } from '@/lib/db'

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
  const db = await getRequestSqlServerDataSource()
  const [riskLevel, linkedRequirements] = await Promise.all([
    getRiskLevelById(db, numericId),
    getLinkedRequirements(db, numericId),
  ])
  if (!riskLevel) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ riskLevel, linkedRequirements })
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
  const db = await getRequestSqlServerDataSource()
  const body = (await request.json()) as Parameters<typeof updateRiskLevel>[2]
  const riskLevel = await updateRiskLevel(db, numericId, body)
  if (!riskLevel) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(riskLevel)
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
  const db = await getRequestSqlServerDataSource()
  await deleteRiskLevel(db, numericId)
  return NextResponse.json({ ok: true })
}
