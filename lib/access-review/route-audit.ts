import {
  recordAllowedActionAuditEvent,
  recordDeniedActionAuditEvent,
} from '@/lib/audit/action-audit'
import {
  recordSecurityEvent,
  type SecurityEventDetailValue,
} from '@/lib/auth/audit'
import { getRequestSqlServerDataSource } from '@/lib/db'
import type { RequestContext } from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

type AuditDetail = Record<string, SecurityEventDetailValue | null | undefined>

function compactDetail(
  detail: AuditDetail,
): Record<string, SecurityEventDetailValue> {
  return Object.fromEntries(
    Object.entries(detail).filter(
      (entry): entry is [string, SecurityEventDetailValue] => entry[1] != null,
    ),
  )
}

export function accessReviewAuditActor(context: RequestContext) {
  return {
    hsaId: context.actor.hsaId ?? undefined,
    source: context.actor.source,
    sub: context.actor.id ?? undefined,
  }
}

export function accessReviewServiceActor(context: RequestContext) {
  return {
    displayName: context.actor.displayName,
    hsaId: context.actor.hsaId,
    roles: [...context.actor.roles],
  }
}

export async function recordAccessReviewActionSucceeded(
  context: RequestContext,
  input: {
    action: string
    detail?: AuditDetail
    targetId?: number | string | null
  },
): Promise<void> {
  const db = await getRequestSqlServerDataSource()
  await recordAllowedActionAuditEvent(db, context, {
    action: input.action,
    details: compactDetail(input.detail ?? {}),
    targetId: input.targetId,
    targetKind: 'AccessReview',
  })
}

export async function recordAccessReviewAuthorizationDenied(
  context: RequestContext | null,
  request: Request,
  detail: AuditDetail,
  error: unknown,
): Promise<void> {
  if (
    !context ||
    !isRequirementsServiceError(error) ||
    (error.code !== 'forbidden' && error.code !== 'unauthorized')
  ) {
    return
  }

  const reason =
    typeof error.details?.reason === 'string' ? error.details.reason : undefined
  const db = await getRequestSqlServerDataSource()
  await recordDeniedActionAuditEvent(db, context, {
    action:
      typeof detail.actionKind === 'string'
        ? `${detail.actionKind}.denied`
        : 'access_review.authorization.denied',
    denialReason: reason ?? error.code,
    details: compactDetail({
      ...detail,
      errorCode: error.code,
      reason,
      requestSource: context.source,
    }),
    targetId:
      typeof detail.reviewId === 'number' || typeof detail.reviewId === 'string'
        ? detail.reviewId
        : null,
    targetKind: 'AccessReview',
  })

  recordSecurityEvent({
    actor: accessReviewAuditActor(context),
    detail: compactDetail({
      ...detail,
      errorCode: error.code,
      reason,
      requestSource: context.source,
    }),
    event: 'auth.authorization.denied',
    outcome: 'failure',
    request: context.request ?? request,
  })
}
