import { NextResponse } from 'next/server'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
import { unauthorizedError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { buildRequirementsImportJsonSchema } from '@/lib/requirements/import-schema'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

async function getHandler(request: Request) {
  try {
    const { context } = await createRequirementsRestRuntime(request)
    if (!context.actor.isAuthenticated) {
      throw unauthorizedError()
    }
    const locale =
      new URL(request.url).searchParams.get('locale') === 'sv' ? 'sv' : 'en'
    return NextResponse.json(buildRequirementsImportJsonSchema(locale), {
      headers: {
        'Content-Type': 'application/schema+json; charset=utf-8',
      },
    })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const GET = withRestResponsePolicy(getHandler)
