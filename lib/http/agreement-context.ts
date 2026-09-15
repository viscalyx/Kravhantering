import { z } from 'zod'
import {
  positiveIntegerSchema,
  readJsonWithSchema,
} from '@/lib/http/validation'

const agreementContextSchema = z
  .object({ agreementId: positiveIntegerSchema.optional() })
  .strict()

/** Case actions outside a specification view have no selected agreement. */
export function readOptionalAgreementContext({
  request,
}: {
  request: Request
}) {
  return request.body === null
    ? Promise.resolve({
        ok: true as const,
        data: {} as z.infer<typeof agreementContextSchema>,
      })
    : readJsonWithSchema(request, agreementContextSchema)
}
