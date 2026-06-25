import { NextResponse } from 'next/server'
import { unauthorizedError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { buildRequirementsImportJsonSchema } from '@/lib/requirements/import-schema'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

export async function GET(request: Request) {
  try {
    const { context } = await createRequirementsRestRuntime(request)
    if (!context.actor.isAuthenticated) {
      throw unauthorizedError()
    }
    const locale =
      new URL(request.url).searchParams.get('locale') === 'sv' ? 'sv' : 'en'
    return NextResponse.json(buildRequirementsImportJsonSchema(locale), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/schema+json; charset=utf-8',
      },
    })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}
