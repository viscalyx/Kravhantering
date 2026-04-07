import { getCloudflareContext } from '@opennextjs/cloudflare'
import { type NextRequest, NextResponse } from 'next/server'
import { revertToDraft } from '@/lib/dal/deviations'
import { getDb } from '@/lib/db'
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

  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)

  try {
    await revertToDraft(db, numericId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isRequirementsServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      )
    }
    console.error('Failed to revert deviation to draft', error)
    return NextResponse.json(
      { error: 'Failed to revert to draft' },
      { status: 500 },
    )
  }
}
