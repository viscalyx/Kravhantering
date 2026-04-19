import { NextResponse } from 'next/server'
import { requestPackageLocalReview } from '@/lib/dal/deviations'
import { getRequestDatabase } from '@/lib/db'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

type Params = Promise<{ id: string }>

export async function POST(_request: Request, { params }: { params: Params }) {
  const { id } = await params
  const deviationId = Number(id)
  if (!Number.isInteger(deviationId) || deviationId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const db = await getRequestDatabase()

  try {
    await requestPackageLocalReview(db, deviationId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }

    console.error('Failed to request package-local deviation review', error)
    return NextResponse.json(
      { error: 'Failed to request review' },
      { status: 500 },
    )
  }
}
