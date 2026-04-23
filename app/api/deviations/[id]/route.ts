import { type NextRequest, NextResponse } from 'next/server'
import {
  deleteDeviation,
  getDeviation,
  updateDeviation,
} from '@/lib/dal/deviations'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

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

  try {
    const deviation = await getDeviation(db, numericId)
    return NextResponse.json(deviation)
  } catch (error) {
    if (isRequirementsServiceError(error) && error.code === 'not_found') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    throw error
  }
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { motivation, createdBy } = body as Record<string, unknown>

  if (motivation !== undefined && typeof motivation !== 'string') {
    return NextResponse.json(
      { error: 'motivation must be a string' },
      { status: 400 },
    )
  }

  if (
    createdBy !== undefined &&
    createdBy !== null &&
    typeof createdBy !== 'string'
  ) {
    return NextResponse.json(
      { error: 'createdBy must be a string or null' },
      { status: 400 },
    )
  }
  const db = await getRequestSqlServerDataSource()

  try {
    await updateDeviation(db, numericId, {
      motivation: motivation as string | undefined,
      createdBy: createdBy as string | null | undefined,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to update deviation', error)
    return NextResponse.json(
      { error: 'Failed to update deviation' },
      { status: 500 },
    )
  }
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

  try {
    await deleteDeviation(db, numericId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to delete deviation', error)
    return NextResponse.json(
      { error: 'Failed to delete deviation' },
      { status: 500 },
    )
  }
}
