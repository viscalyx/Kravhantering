import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordActionAuditEvent } from '@/lib/audit/action-audit'
import { recordSecurityEvent } from '@/lib/auth/audit'
import { isHsaId } from '@/lib/auth/hsa-id'
import { consumeHsaVerificationQuota } from '@/lib/dal/hsa-verification-quota'
import { canManageAreaCoAuthors } from '@/lib/dal/requirement-areas'
import { canManageSpecificationAssignments } from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  customMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  boundedDbStringSchema,
  positiveIntegerSchema,
} from '@/lib/http/validation'
import { recordCapacityEvent } from '@/lib/observability/capacity'
import {
  forbiddenError,
  isRequirementsServiceError,
} from '@/lib/requirements/errors'
import {
  requireRequirementPackageCreatePermission,
  requireRequirementPackageLeadOrAdmin,
} from '@/lib/requirements/requirement-package-permissions'
import {
  createRequirementResponsibilityPersonVerificationEvidence,
  REQUIREMENT_RESPONSIBILITY_PERSON_VERIFICATION_PURPOSES,
  requirementResponsibilityPersonActorFingerprint,
  requirementResponsibilityPersonTargetFingerprint,
  toRequirementResponsibilityPersonVerificationPayload,
  verifyRequirementResponsibilityPerson,
} from '@/lib/requirements/responsibility-person-verification'

const THROTTLED_ERROR = {
  code: 'hsa_verification_throttled',
  error: 'Too many HSA verification requests.',
} as const
const QUOTA_UNAVAILABLE_RETRY_AFTER_SECONDS = 5
const QUOTA_UNAVAILABLE_ERROR = {
  code: 'service_unavailable',
  error: 'Service unavailable.',
  retryAfterSeconds: QUOTA_UNAVAILABLE_RETRY_AFTER_SECONDS,
} as const

type VerificationAuditOutcome =
  | 'conflict'
  | 'not_found'
  | 'provider_failure'
  | 'quota_unavailable'
  | 'success'
  | 'throttled'

const verifyPurposeSchema = z.enum(
  REQUIREMENT_RESPONSIBILITY_PERSON_VERIFICATION_PURPOSES,
)

const verifyModeSchema = z.enum(['reuse_local', 'refresh'])

const verifySchema = z
  .object({
    hsaId: boundedDbStringSchema.refine(isHsaId, {
      message: 'Expected a valid HSA-id',
    }),
    mode: verifyModeSchema,
    purpose: verifyPurposeSchema,
    scopeId: positiveIntegerSchema.optional(),
  })
  .strict()

function isAdmin(roles: string[]): boolean {
  return roles.includes('Admin')
}

function verificationOutcome(error: unknown): VerificationAuditOutcome {
  if (!isRequirementsServiceError(error)) return 'provider_failure'
  if (error.details?.reason === 'hsa_lookup_not_found') return 'not_found'
  if (error.code === 'conflict') return 'conflict'
  return 'provider_failure'
}

export const POST = secureMutationRoute({
  bodySchema: verifySchema,
  policy: customMutationPolicy<z.infer<typeof verifySchema>>(
    'requirement_responsibility_person.verify',
    async ({ body, context }) => {
      let db: Awaited<ReturnType<typeof getRequestSqlServerDataSource>> | null =
        null
      const getDb = async () => {
        db ??= await getRequestSqlServerDataSource()
        return db
      }

      if (body.purpose === 'requirement_area_owner') {
        if (context.actor.roles.includes('Admin')) {
          return
        }
        if (!body.scopeId) {
          throw forbiddenError('Requirement area scope is required', {
            reason: 'scope_required',
          })
        }
        const allowed = await canManageAreaCoAuthors(
          await getDb(),
          body.scopeId,
          context.actor.hsaId,
          false,
        )
        if (!allowed) {
          throw forbiddenError(
            'Missing requirement area owner management permission',
            { reason: 'requirement_area_owner_manager_required' },
          )
        }
      }

      if (body.purpose === 'requirement_area_co_author') {
        if (!body.scopeId) {
          throw forbiddenError('Requirement area scope is required', {
            reason: 'scope_required',
          })
        }
        const allowed = await canManageAreaCoAuthors(
          await getDb(),
          body.scopeId,
          context.actor.hsaId,
          isAdmin(context.actor.roles),
        )
        if (!allowed) {
          throw forbiddenError(
            'Missing requirement area co-author management permission',
            { reason: 'requirement_area_co_author_manager_required' },
          )
        }
      }

      if (
        body.purpose === 'requirement_package_co_author' ||
        body.purpose === 'requirement_package_lead'
      ) {
        if (body.scopeId) {
          await requireRequirementPackageLeadOrAdmin(
            await getDb(),
            context,
            body.scopeId,
            'requirement_package.update',
          )
        } else if (
          body.purpose === 'requirement_package_lead' &&
          context.actor.hsaId?.trim().toLowerCase() ===
            body.hsaId.trim().toLowerCase()
        ) {
          await requireRequirementPackageCreatePermission(
            await getDb(),
            context,
          )
        } else {
          throw forbiddenError('Requirement package scope is required', {
            reason: 'scope_required',
          })
        }
      }

      if (
        body.purpose === 'requirements_specification_responsible' ||
        body.purpose === 'requirements_specification_co_author'
      ) {
        if (
          body.purpose === 'requirements_specification_responsible' &&
          !body.scopeId &&
          context.actor.hsaId &&
          body.hsaId.trim().toLowerCase() ===
            context.actor.hsaId.trim().toLowerCase()
        ) {
          return
        }
        if (!body.scopeId) {
          throw forbiddenError('Missing specification scope', {
            reason: 'scope_required',
          })
        }
        const allowed = await canManageSpecificationAssignments(
          await getDb(),
          body.scopeId,
          context.actor.hsaId,
          isAdmin(context.actor.roles),
        )
        if (!allowed) {
          throw forbiddenError(
            'Missing specification assignment management permission',
            { reason: 'specification_assignment_manager_required' },
          )
        }
      }
    },
  ),
  handler: async ({ body, context, request }) => {
    const targetFingerprint = requirementResponsibilityPersonTargetFingerprint(
      body.hsaId,
    )
    const actorFingerprint = requirementResponsibilityPersonActorFingerprint(
      context.actor,
    )
    const recordSecurityOutcome = (outcome: VerificationAuditOutcome) => {
      const details = {
        mode: body.mode,
        outcome,
        purpose: body.purpose,
        ...(body.scopeId === undefined ? {} : { scopeId: body.scopeId }),
        targetFingerprint,
      }
      recordSecurityEvent({
        actor: {
          source: context.actor.source,
          sub: actorFingerprint,
        },
        detail: details,
        event: 'requirements.hsa_verification.completed',
        outcome: outcome === 'success' ? 'success' : 'failure',
        request,
      })
      return details
    }

    const throttledResponse = (retryAfterSeconds: number) => {
      recordSecurityOutcome('throttled')
      recordCapacityEvent({
        event: 'capacity.throttled',
        level: 'warn',
        metrics: { throttled: true },
        operation: 'requirements.hsa_verification',
        outcome: 'throttled',
        request,
        retryAfterSeconds,
        source: 'rest',
        statusCode: 429,
      })
      return NextResponse.json(
        { ...THROTTLED_ERROR, retryAfterSeconds },
        {
          headers: { 'Retry-After': String(retryAfterSeconds) },
          status: 429,
        },
      )
    }

    let db: Awaited<ReturnType<typeof getRequestSqlServerDataSource>>
    try {
      db = await getRequestSqlServerDataSource()
      const quota = await consumeHsaVerificationQuota(db, {
        actorFingerprint,
        actorSubjectFingerprint: context.actor.hsaId
          ? requirementResponsibilityPersonTargetFingerprint(
              context.actor.hsaId,
            )
          : null,
        targetFingerprint,
      })
      if (!quota.allowed) {
        return throttledResponse(quota.retryAfterSeconds)
      }
    } catch (error) {
      logSanitizedError('Failed to enforce HSA verification quota', error)
      recordSecurityOutcome('quota_unavailable')
      recordCapacityEvent({
        event: 'capacity.operation.failed',
        level: 'error',
        operation: 'requirements.hsa_verification',
        outcome: 'failure',
        request,
        source: 'rest',
        statusCode: 503,
      })
      return NextResponse.json(QUOTA_UNAVAILABLE_ERROR, {
        headers: {
          'Retry-After': String(QUOTA_UNAVAILABLE_RETRY_AFTER_SECONDS),
        },
        status: 503,
      })
    }

    const recordOutcome = async (
      outcome: VerificationAuditOutcome,
    ): Promise<void> => {
      const details = recordSecurityOutcome(outcome)
      try {
        await recordActionAuditEvent(db, {
          action: 'requirement_responsibility_person.verify',
          actorClientId: actorFingerprint,
          actorDisplayName: null,
          actorHsaId: null,
          actorKind:
            context.source === 'mcp' || context.actor.source === 'mcp'
              ? 'mcp_client'
              : context.actor.isAuthenticated
                ? 'user'
                : 'system',
          clientIp: context.request?.ip ?? null,
          correlationId: context.correlationId,
          decision: 'allowed',
          details,
          requestId: context.requestId,
          targetId: targetFingerprint,
          targetKind: 'requirement_responsibility_person_verification',
        })
      } catch (error) {
        logSanitizedError(
          'Failed to record requirement responsibility person verification action audit event',
          error,
        )
      }
    }

    let person: Awaited<
      ReturnType<typeof verifyRequirementResponsibilityPerson>
    >
    try {
      person = await verifyRequirementResponsibilityPerson(
        db,
        body.hsaId,
        body.mode,
      )
    } catch (error) {
      await recordOutcome(verificationOutcome(error))
      throw error
    }
    const verification =
      createRequirementResponsibilityPersonVerificationEvidence({
        actor: context.actor,
        person,
        purpose: body.purpose,
        scopeId: body.scopeId,
      })
    await recordOutcome('success')
    return NextResponse.json({
      ...verification,
      person: toRequirementResponsibilityPersonVerificationPayload(person),
    })
  },
})
