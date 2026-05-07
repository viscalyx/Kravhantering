import { type NextRequest, NextResponse } from 'next/server'
import {
  deleteRequirementPackage,
  getLinkedRequirementsForPackage,
  getRequirementPackageById,
  updateRequirementPackage,
} from '@/lib/dal/requirement-packages'
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
  const [requirementPackage, linkedRequirements] = await Promise.all([
    getRequirementPackageById(db, numericId),
    getLinkedRequirementsForPackage(db, numericId),
  ])
  if (!requirementPackage) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ requirementPackage, linkedRequirements })
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
  const body = (await request.json()) as Parameters<
    typeof updateRequirementPackage
  >[2]
  const requirementPackage = await updateRequirementPackage(db, numericId, body)
  if (!requirementPackage) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(requirementPackage)
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
  await deleteRequirementPackage(db, numericId)
  return NextResponse.json({ ok: true })
}
