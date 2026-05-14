import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { CsrfError } from '@/lib/auth/csrf'
import { isHsaId } from '@/lib/auth/hsa-id'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  optionalBoundedDbStringSchema,
} from '@/lib/http/validation'
import { previewPrivacyErasure } from '@/lib/privacy/erasure'
import {
  assertPrivacyOfficer,
  auditActor,
  unexpectedErrorBody,
} from '@/lib/privacy/route-helpers'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

const hsaIdSchema = boundedDbStringSchema.refine(isHsaId, {
  message: 'HSA-ID must use format SE<10-digit org no>-<alphanumeric suffix>.',
})

const replacementSchema = z
  .object({
    displayName: boundedDbStringSchema,
    email: optionalBoundedDbStringSchema.refine(
      value => value == null || z.email().safeParse(value).success,
      { message: 'Replacement email must be a valid email address.' },
    ),
    firstName: optionalBoundedDbStringSchema,
    hsaId: hsaIdSchema,
    lastName: optionalBoundedDbStringSchema,
  })
  .strict()

const erasurePreviewSchema = z
  .object({
    replacement: replacementSchema.nullable().optional(),
    target: z
      .object({
        hsaId: hsaIdSchema,
      })
      .strict(),
  })
  .strict()

export const POST = secureMutationRoute({
  bodySchema: erasurePreviewSchema,
  policy: customMutationPolicy('privacy.erasure.preview', ({ context }) => {
    assertPrivacyOfficer(context)
  }),
  handler: async ({ body, context, request }) => {
    try {
      const db = await getRequestSqlServerDataSource()
      const preview = await previewPrivacyErasure(db, {
        replacement: body.replacement ?? null,
        target: body.target,
      })
      recordSecurityEvent({
        actor: auditActor(context),
        detail: {
          groupCount: preview.groups.length,
          targetFingerprint: preview.targetFingerprint,
          totalCount: preview.totalCount,
        },
        event: 'privacy.erasure.previewed',
        outcome: 'success',
        request: context.request ?? request,
      })
      return NextResponse.json(preview)
    } catch (error) {
      if (error instanceof CsrfError || isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }
      logSanitizedError('Failed to preview privacy erasure', error)
      return NextResponse.json(
        unexpectedErrorBody('Failed to preview privacy erasure', error),
        { status: 500 },
      )
    }
  },
})
