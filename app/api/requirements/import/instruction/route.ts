import { NextResponse } from 'next/server'
import { unauthorizedError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { withUtf8Bom } from '@/lib/text-export'

export async function GET(request: Request) {
  try {
    const { context, service } = await createRequirementsRestRuntime(request)
    if (!context.actor.isAuthenticated) {
      throw unauthorizedError()
    }
    const locale =
      new URL(request.url).searchParams.get('locale') === 'sv' ? 'sv' : 'en'
    const { importInstruction } = await service.getImportInstruction(context, {
      locale,
    })
    return new NextResponse(withUtf8Bom(importInstruction), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/markdown; charset=utf-8',
      },
    })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}
