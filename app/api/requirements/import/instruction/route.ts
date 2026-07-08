import { NextResponse } from 'next/server'
import { unauthorizedError, validationError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import type { McpImportInstructionDestinationRef } from '@/lib/requirements/import-service'
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

function positiveIntegerQueryValue(
  searchParams: URLSearchParams,
  name: string,
): number | null {
  const rawValue = searchParams.get(name)
  if (rawValue == null) return null
  const value = Number(rawValue)
  return Number.isInteger(value) && value > 0 ? value : null
}

function destinationFromQuery(
  searchParams: URLSearchParams,
): McpImportInstructionDestinationRef {
  const kind = searchParams.get('kind')
  if (kind === 'requirements_specification') {
    const specificationId = positiveIntegerQueryValue(
      searchParams,
      'specificationId',
    )
    if (specificationId != null) return { kind, specificationId }
    throw validationError(MISSING_IMPORT_INSTRUCTION_DESTINATION_MESSAGE, {
      reason: 'missing_import_instruction_destination',
    })
  }
  if (kind === 'requirements_library') {
    return { kind }
  }
  throw validationError(MISSING_IMPORT_INSTRUCTION_DESTINATION_MESSAGE, {
    reason: 'missing_import_instruction_destination',
  })
}

export async function GET(request: Request) {
  try {
    const { context, service } = await createRequirementsRestRuntime(request)
    if (!context.actor.isAuthenticated) {
      throw unauthorizedError()
    }
    const searchParams = new URL(request.url).searchParams
    const locale = searchParams.get('locale') === 'sv' ? 'sv' : 'en'
    const { importInstruction } = await service.getImportInstruction(context, {
      destination: destinationFromQuery(searchParams),
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
