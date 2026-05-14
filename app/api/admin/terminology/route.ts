import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAdminPrivilegedActionSucceeded } from '@/lib/admin/privileged-audit'
import {
  formatUiSettingsLoadError,
  getUiTerminology,
  updateUiTerminology,
} from '@/lib/dal/ui-settings'
import { getRequestSqlServerDataSource } from '@/lib/db'
import {
  adminMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { invalidRequestResponse } from '@/lib/http/validation'
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

export async function GET() {
  try {
    const db = await getRequestSqlServerDataSource()
    const terminology = await getUiTerminology(db)

    return NextResponse.json({
      terminology: buildUiTerminologyPayload(terminology),
    })
  } catch (error) {
    console.error(
      'Failed to load stored terminology',
      formatUiSettingsLoadError(error),
    )
    return NextResponse.json(
      { error: 'Failed to load terminology.' },
      { status: 500 },
    )
  }
}

export const PUT = secureMutationRoute({
  bodySchema: terminologyPayloadSchema,
  policy: adminMutationPolicy(),
  handler: async ({ body, context }) => {
    try {
      const uniqueKeys = new Set(body.terminology.map(entry => entry.key))

      if (uniqueKeys.size !== UI_TERM_KEYS.length) {
        return invalidRequestResponse([
          {
            code: 'custom',
            message: 'Each terminology key must be provided exactly once.',
            path: 'terminology',
          },
        ])
      }
      const db = await getRequestSqlServerDataSource()
      const terminology = await updateUiTerminology(db, body.terminology)
      recordAdminPrivilegedActionSucceeded(context, {
        itemCount: body.terminology.length,
        operation: 'save',
        resourceType: 'ui_terminology',
      })

      return NextResponse.json({
        terminology: buildUiTerminologyPayload(terminology),
      })
    } catch (error) {
      console.error(
        'Failed to save terminology',
        formatUiSettingsLoadError(error),
      )
      return NextResponse.json(
        { error: 'Failed to save terminology.' },
        { status: 500 },
      )
    }
  },
})
