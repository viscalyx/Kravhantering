import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { CsrfError } from '@/lib/auth/csrf'
import { isHsaId } from '@/lib/auth/hsa-id'
import {
  getSessionFromRequest,
  isSignedIn,
  type LoggedInSession,
} from '@/lib/auth/session'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { boundedDbStringSchema, localeSchema } from '@/lib/http/validation'
import { synchronousGeneratedOutputErrorResponse } from '@/lib/pdf/synchronous-generation'
import type { CollectDataSubjectExportInput } from '@/lib/privacy/data-subject-export'
import { generateDataSubjectExport } from '@/lib/privacy/data-subject-export-output'
import type { DataSubjectExportSessionClaims } from '@/lib/privacy/data-subject-export-types'
import { auditActor, unexpectedErrorBody } from '@/lib/privacy/route-helpers'
import {
  type RequestContext,
  requireHumanActorSnapshot,
} from '@/lib/requirements/auth'
import {
  forbiddenError,
  isRequirementsServiceError,
  unauthorizedError,
} from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export const dynamic = 'force-dynamic'

const hsaIdSchema = boundedDbStringSchema.refine(isHsaId, {
  message:
    'HSA-id must use format <two-letter country code><10-digit org no>-<alphanumeric suffix>.',
})

const dataSubjectExportSchema = z
  .object({
    delivery: z.union([z.literal('json'), z.literal('pdf')]),
    locale: localeSchema.optional().default('sv'),
    target: z
      .object({
        hsaId: hsaIdSchema,
      })
      .strict()
      .optional(),
  })
  .strict()

function sessionClaims(
  session: LoggedInSession,
): DataSubjectExportSessionClaims {
  return {
    expiresAt: session.accessTokenExpiresAt,
    familyName: session.familyName,
    givenName: session.givenName,
    hsaId: session.hsaId,
    name: session.name,
    roles: uniqueRoles(session.roles),
    sub: session.sub,
    ...(session.email ? { email: session.email } : {}),
  }
}

function uniqueRoles(roles: readonly string[]): string[] {
  return [...new Set(roles)]
}

function assertDataSubjectExportAllowed(
  context: RequestContext,
  targetHsaId: string,
): void {
  if (!context.actor.isAuthenticated) {
    throw unauthorizedError('Authentication is required', {
      reason: 'authentication_required',
    })
  }

  const actorSnapshot = requireHumanActorSnapshot(context)
  if (actorSnapshot.hsaId === targetHsaId) return

  if (!context.actor.roles.includes('PrivacyOfficer')) {
    throw forbiddenError(
      'PrivacyOfficer role is required for cross-user export',
      {
        reason: 'privacy_officer_required',
      },
    )
  }
}

export const POST = secureMutationRoute({
  bodySchema: dataSubjectExportSchema,
  policy: customMutationPolicy<
    z.infer<typeof dataSubjectExportSchema>,
    unknown
  >('privacy.data_subject_export', ({ body, context }) => {
    if (!context.actor.hsaId) {
      throw unauthorizedError('Authentication with HSA-id is required', {
        reason: 'missing_actor_hsa_id',
      })
    }
    const targetHsaId = body.target?.hsaId ?? context.actor.hsaId
    assertDataSubjectExportAllowed(context, targetHsaId)
  }),
  handler: async ({ body, context, request }) => {
    try {
      if (!context.actor.hsaId) {
        throw unauthorizedError('Authentication with HSA-id is required', {
          reason: 'missing_actor_hsa_id',
        })
      }
      const targetHsaId = body.target?.hsaId ?? context.actor.hsaId
      assertDataSubjectExportAllowed(context, targetHsaId)

      const session = await getSessionFromRequest(request, new Response())
      const selfExport =
        isSignedIn(session) && session.hsaId === targetHsaId
          ? sessionClaims(session)
          : null
      const db = await getRequestSqlServerDataSource()
      const actorSnapshot = requireHumanActorSnapshot(context)
      const exportInput = {
        generatedBy: {
          displayName: actorSnapshot.displayName,
          hsaId: actorSnapshot.hsaId,
          roles: uniqueRoles(context.actor.roles),
          source: context.actor.source,
          ...(context.actor.id ? { sub: context.actor.id } : {}),
        },
        selfSession: selfExport,
        target: { hsaId: targetHsaId },
      } satisfies CollectDataSubjectExportInput

      const generated = await generateDataSubjectExport({
        context,
        db,
        delivery: body.delivery,
        input: exportInput,
        locale: body.locale,
        requestSignal: request.signal,
      })
      recordDataSubjectExportSecurityEvent(
        body.delivery,
        generated.payload,
        context,
        request,
      )
      return generated.response
    } catch (error) {
      if (error instanceof CsrfError || isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }
      const generatedResponse = synchronousGeneratedOutputErrorResponse(
        body.delivery,
        error,
      )
      if (generatedResponse) return generatedResponse
      logSanitizedError('Failed to generate data-subject export', error)
      return NextResponse.json(
        unexpectedErrorBody('Failed to generate data-subject export', error),
        { status: 500 },
      )
    }
  },
})

function recordDataSubjectExportSecurityEvent(
  delivery: 'json' | 'pdf',
  exportPayload: Awaited<
    ReturnType<typeof generateDataSubjectExport>
  >['payload'],
  context: RequestContext,
  request: Request,
): void {
  recordSecurityEvent({
    actor: auditActor(context),
    detail: {
      delivery,
      itemCount: exportPayload.summary.itemCount,
      sourceCount: exportPayload.summary.sourceCount,
      targetFingerprint: exportPayload.subject.targetFingerprint,
    },
    event: 'privacy.data_subject_export.generated',
    outcome: 'success',
    request: context.request ?? request,
  })
}
