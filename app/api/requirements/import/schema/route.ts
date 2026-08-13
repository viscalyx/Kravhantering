import { NextResponse } from 'next/server'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

async function getHandler(request: Request) {
  try {
    const { context, service } = await createRequirementsRestRuntime(request)
    const locale =
      new URL(request.url).searchParams.get('locale') === 'sv' ? 'sv' : 'en'
    return NextResponse.json(
      await service.getImportSchema(context, { locale }),
      {
        headers: {
          'Content-Type': 'application/schema+json; charset=utf-8',
        },
      },
    )
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const GET = withRestResponsePolicy(getHandler)
