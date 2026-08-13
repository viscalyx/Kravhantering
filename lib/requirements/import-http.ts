import { NextResponse } from 'next/server'
import type { ZodType } from 'zod'
import { readBoundedJsonRequest } from '@/lib/http/bounded-json-request'
import { invalidJsonResponse, parseWithSchema } from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import {
  REQUIREMENT_IMPORT_CONTENT_MAX_BYTES,
  REQUIREMENT_IMPORT_TRANSPORT_MAX_BYTES,
  type RequirementImportBudget,
  validateImportContentBudget,
} from '@/lib/requirements/import-budget'

export interface ReadRequirementImportRequestOptions<T> {
  budget: RequirementImportBudget
  content: (body: unknown) => unknown
  schema: ZodType<T>
}

function stableImportError(
  status: 413 | 422,
  code: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    {
      code,
      ...(details ? { details } : {}),
      error: 'Requirement import exceeds the allowed budget.',
    },
    { status },
  )
}

export async function readRequirementImportRequest<T>(
  request: Request,
  options: ReadRequirementImportRequestOptions<T>,
) {
  const bounded = await readBoundedJsonRequest(request, {
    maxBytes: REQUIREMENT_IMPORT_TRANSPORT_MAX_BYTES,
  })
  if (!bounded.ok) {
    return {
      ok: false as const,
      response:
        bounded.code === 'invalid_json'
          ? invalidJsonResponse()
          : stableImportError(413, 'import_transport_bytes_exceeded', {
              maxBytes: REQUIREMENT_IMPORT_TRANSPORT_MAX_BYTES,
            }),
    }
  }

  const content = options.content(bounded.data)
  const canonicalContent = JSON.stringify(content)
  const contentBytes =
    canonicalContent === undefined
      ? 0
      : new TextEncoder().encode(canonicalContent).byteLength
  if (contentBytes > REQUIREMENT_IMPORT_CONTENT_MAX_BYTES) {
    return {
      ok: false as const,
      response: stableImportError(413, 'import_content_bytes_exceeded', {
        maxBytes: REQUIREMENT_IMPORT_CONTENT_MAX_BYTES,
      }),
    }
  }

  const [budgetIssue] = validateImportContentBudget(content, options.budget)
  if (budgetIssue) {
    return {
      ok: false as const,
      response: stableImportError(422, budgetIssue.code, {
        actual: budgetIssue.actual,
        limit: budgetIssue.limit,
        path: budgetIssue.path,
      }),
    }
  }

  return parseWithSchema(options.schema, bounded.data)
}

export function requirementImportHttpErrorResponse(
  error: unknown,
): NextResponse {
  const { body, status } = toHttpErrorPayload(error)
  return NextResponse.json(body, {
    headers:
      isRequirementsServiceError(error) && error.code === 'import_capacity_busy'
        ? { 'Retry-After': '5' }
        : undefined,
    status,
  })
}
