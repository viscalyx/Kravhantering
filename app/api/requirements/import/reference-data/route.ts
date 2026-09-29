import { NextResponse } from 'next/server'
import { withRestResponsePolicy } from '@/lib/http/response-policy'
import { unauthorizedError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import {
  importDestinationFromQuery,
  importLocaleFromQuery,
} from '@/lib/requirements/import-destination-query'
import { serializeRequirementImportReferenceDataFile } from '@/lib/requirements/import-reference-data-file'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'

const MISSING_REFERENCE_DATA_DESTINATION_MESSAGE =
  'Reference data destination is required. ' +
  'Use kind=requirements_library, or kind=requirements_specification with a ' +
  'positive integer specificationId.'

async function getHandler(request: Request) {
  try {
    const { context, service } = await createRequirementsRestRuntime(request)
    if (!context.actor.isAuthenticated) {
      throw unauthorizedError()
    }
    const searchParams = new URL(request.url).searchParams
    const referenceDataFile = await service.getImportReferenceDataFile(
      context,
      {
        destination: importDestinationFromQuery(
          searchParams,
          MISSING_REFERENCE_DATA_DESTINATION_MESSAGE,
        ),
        locale: importLocaleFromQuery(searchParams),
      },
    )
    return new NextResponse(
      serializeRequirementImportReferenceDataFile(referenceDataFile),
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      },
    )
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const GET = withRestResponsePolicy(getHandler)
