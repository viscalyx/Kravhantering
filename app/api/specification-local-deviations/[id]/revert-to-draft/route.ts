import { NextResponse } from 'next/server'
import { revertSpecificationLocalToDraft } from '@/lib/dal/deviations'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

type Params = Promise<{ id: string }>

export async function POST(_request: Request, { params }: { params: Params }) {
  const { id } = await params
  const deviationId = Number(id)
  if (!Number.isInteger(deviationId) || deviationId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  try {
    const db = await getRequestSqlServerDataSource()
    await revertSpecificationLocalToDraft(db, deviationId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }

    console.error(
      'Failed to revert specification-local deviation to draft',
      error,
    )
    return NextResponse.json(
      { error: 'Failed to revert to draft' },
      { status: 500 },
    )
  }
}
