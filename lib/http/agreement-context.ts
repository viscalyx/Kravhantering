import { z } from 'zod'
import {
  invalidJsonResponse,
  parseWithSchema,
  positiveIntegerSchema,
} from '@/lib/http/validation'

const agreementContextSchema = z
  .object({ agreementId: positiveIntegerSchema.optional() })
  .strict()

/** Case actions outside a specification view have no selected agreement. */
export async function readOptionalAgreementContext({
  request,
}: {
  request: Request
}) {
  try {
    // Node's HTTP adapter can supply an empty stream for a POST without a body.
    const text = await request.text()
    return parseWithSchema(
      agreementContextSchema,
      text === '' ? {} : JSON.parse(text),
    )
  } catch {
    return { ok: false as const, response: invalidJsonResponse() }
  }
}
