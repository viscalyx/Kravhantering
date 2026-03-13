import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUiTerminology, updateUiTerminology } from '@/lib/dal/ui-settings'
import { getDb } from '@/lib/db'
import { buildUiTerminologyPayload, UI_TERM_KEYS } from '@/lib/ui-terminology'

const termFormsSchema = z
  .object({
    definitePlural: z.string().trim().min(1).max(120),
    plural: z.string().trim().min(1).max(120),
    singular: z.string().trim().min(1).max(120),
  })
  .strict()

const terminologyEntrySchema = z
  .object({
    en: termFormsSchema,
    key: z.enum(UI_TERM_KEYS),
    sv: termFormsSchema,
  })
  .strict()

const terminologyPayloadSchema = z
  .object({
    terminology: z.array(terminologyEntrySchema).length(UI_TERM_KEYS.length),
  })
  .strict()

function toValidationError(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: 'Invalid terminology payload',
        issues: error.issues,
      },
      { status: 400 },
    )
  }

  return null
}

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })
  const db = getDb(env.DB)
  const terminology = await getUiTerminology(db)

  return NextResponse.json({
    terminology: buildUiTerminologyPayload(terminology),
  })
}

export async function PUT(request: Request) {
  try {
    let payload: unknown

    try {
      payload = await request.json()
    } catch (error) {
      if (error instanceof SyntaxError) {
        return NextResponse.json(
          { error: 'Malformed JSON body.' },
          { status: 400 },
        )
      }

      throw error
    }

    const body = terminologyPayloadSchema.parse(payload)
    const uniqueKeys = new Set(body.terminology.map(entry => entry.key))

    if (uniqueKeys.size !== UI_TERM_KEYS.length) {
      return NextResponse.json(
        { error: 'Each terminology key must be provided exactly once.' },
        { status: 400 },
      )
    }

    const { env } = await getCloudflareContext({ async: true })
    const db = getDb(env.DB)
    const terminology = await updateUiTerminology(db, body.terminology)

    return NextResponse.json({
      terminology: buildUiTerminologyPayload(terminology),
    })
  } catch (error) {
    const validationError = toValidationError(error)
    if (validationError) {
      return validationError
    }

    return NextResponse.json(
      { error: 'Failed to save terminology.' },
      { status: 500 },
    )
  }
}
