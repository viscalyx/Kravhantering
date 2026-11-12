import { NextResponse } from 'next/server'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
import { unauthorizedError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import {
  importDestinationFromQuery,
  importLocaleFromQuery,
} from '@/lib/requirements/import-destination-query'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { withUtf8Bom } from '@/lib/text-export'

const MISSING_IMPORT_INSTRUCTION_DESTINATION_MESSAGE =
  'Import instruction destination is required. ' +
  'AI agents should ask the user whether the import targets a requirements library ' +
  'or a requirements specification. For requirements_library, call ' +
  'requirements_get_import_instruction again with destination {kind:"requirements_library"}. ' +
  'For requirements_specification, call requirements_manage_import with operation ' +
  'list_destinations or search_destinations to resolve the specificationId before ' +
  'calling requirements_get_import_instruction again.'

async function getHandler(request: Request) {
  try {
    const { context, service } = await createRequirementsRestRuntime(request)
    if (!context.actor.isAuthenticated) {
      throw unauthorizedError()
    }
    const searchParams = new URL(request.url).searchParams
    const { importInstruction } = await service.getImportInstruction(context, {
      destination: importDestinationFromQuery(
        searchParams,
        MISSING_IMPORT_INSTRUCTION_DESTINATION_MESSAGE,
      ),
      locale: importLocaleFromQuery(searchParams),
    })
    return new NextResponse(withUtf8Bom(importInstruction), {
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
