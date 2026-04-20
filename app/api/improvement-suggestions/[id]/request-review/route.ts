import { type NextRequest, NextResponse } from 'next/server'
import { requestReview } from '@/lib/dal/improvement-suggestions'
import { getRequestDatabaseConnection } from '@/lib/db'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

type Params = Promise<{ id: string }>

export async function POST(
  _request: NextRequest,
  { params }: { params: Params },
) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const db = await getRequestDatabaseConnection()

  try {
    await requestReview(db, numericId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to request suggestion review', error)
    return NextResponse.json(
      { error: 'Failed to request review' },
      { status: 500 },
    )
  }
}
