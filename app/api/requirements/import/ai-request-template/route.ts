import { NextResponse } from 'next/server'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
import { unauthorizedError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import {
  importDestinationKindFromQuery,
  importLocaleFromQuery,
} from '@/lib/requirements/import-destination-query'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { withUtf8Bom } from '@/lib/text-export'

const MISSING_AI_REQUEST_TEMPLATE_DESTINATION_MESSAGE =
  'AI request template destination kind is required. ' +
  'Use kind=requirements_library or kind=requirements_specification.'

async function getHandler(request: Request) {
  try {
    const { context, service } = await createRequirementsRestRuntime(request)
    if (!context.actor.isAuthenticated) {
      throw unauthorizedError()
    }
    const searchParams = new URL(request.url).searchParams
    const { aiRequestTemplate } = await service.getImportAiRequestTemplate(
      context,
      {
        destinationKind: importDestinationKindFromQuery(
          searchParams,
          MISSING_AI_REQUEST_TEMPLATE_DESTINATION_MESSAGE,
        ),
        locale: importLocaleFromQuery(searchParams),
      },
    )
    return new NextResponse(withUtf8Bom(aiRequestTemplate), {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
      },
    })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const GET = withRestResponsePolicy(getHandler)
