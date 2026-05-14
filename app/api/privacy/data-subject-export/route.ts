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
import {
  getErrorMessage,
  logSanitizedError,
  redactSensitiveText,
} from '@/lib/http/safe-errors'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import { boundedDbStringSchema } from '@/lib/http/validation'
import {
  type CollectDataSubjectExportInput,
  collectDataSubjectExport,
} from '@/lib/privacy/data-subject-export'
import type { DataSubjectExportSessionClaims } from '@/lib/privacy/data-subject-export-types'
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
  message: 'HSA-ID must use format SE<10-digit org no>-<alphanumeric suffix>.',
})

const dataSubjectExportSchema = z
  .object({
    delivery: z.union([z.literal('json'), z.literal('pdf')]),
    target: z
      .object({
        hsaId: hsaIdSchema,
      })
      .strict()
      .optional(),
  })
  .strict()

function auditActor(context: RequestContext) {
  return {
    hsaId: context.actor.hsaId ?? undefined,
    source: context.actor.source,
    sub: context.actor.id ?? undefined,
  }
}

function unexpectedErrorBody(message: string, error: unknown) {
  return {
    ...(process.env.NODE_ENV === 'development'
      ? { debugMessage: redactSensitiveText(getErrorMessage(error)) }
      : {}),
    error: message,
  }
}

function sessionClaims(
  session: LoggedInSession,
): DataSubjectExportSessionClaims {
  return {
    expiresAt: session.accessTokenExpiresAt,
    familyName: session.familyName,
    givenName: session.givenName,
    hsaId: session.hsaId,
    name: session.name,
    roles: [...session.roles],
    sub: session.sub,
    ...(session.email ? { email: session.email } : {}),
  }
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

function addNoStore<T extends NextResponse>(response: T): T {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export const POST = secureMutationRoute({
  bodySchema: dataSubjectExportSchema,
  decorateErrorResponse: addNoStore,
  policy: customMutationPolicy<
    z.infer<typeof dataSubjectExportSchema>,
    unknown
  >('privacy.data_subject_export', ({ body, context }) => {
    if (!context.actor.hsaId) {
      throw unauthorizedError('Authentication with HSA-ID is required', {
        reason: 'missing_actor_hsa_id',
      })
    }
    const targetHsaId = body.target?.hsaId ?? context.actor.hsaId
    assertDataSubjectExportAllowed(context, targetHsaId)
  }),
  handler: async ({ body, context, request }) => {
    try {
      if (!context.actor.hsaId) {
        throw unauthorizedError('Authentication with HSA-ID is required', {
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
      const exportPayload = await collectDataSubjectExport(db, {
        generatedBy: {
          displayName: actorSnapshot.displayName,
          hsaId: actorSnapshot.hsaId,
          roles: [...context.actor.roles],
          source: context.actor.source,
          ...(context.actor.id ? { sub: context.actor.id } : {}),
        },
        selfSession: selfExport,
        target: { hsaId: targetHsaId },
      } satisfies CollectDataSubjectExportInput)

      recordSecurityEvent({
        actor: auditActor(context),
        detail: {
          delivery: body.delivery,
          itemCount: exportPayload.summary.itemCount,
          sourceCount: exportPayload.summary.sourceCount,
          targetFingerprint: exportPayload.subject.targetFingerprint,
        },
        event: 'privacy.data_subject_export.generated',
        outcome: 'success',
        request: context.request ?? request,
      })

      return NextResponse.json(exportPayload, {
        headers: { 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      if (error instanceof CsrfError || isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, {
          headers: { 'Cache-Control': 'no-store' },
          status,
        })
      }
      logSanitizedError('Failed to generate data-subject export', error)
      return NextResponse.json(
        unexpectedErrorBody('Failed to generate data-subject export', error),
        { headers: { 'Cache-Control': 'no-store' }, status: 500 },
      )
    }
  },
})
