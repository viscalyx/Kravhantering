import { getErrorMessage, redactSensitiveText } from '@/lib/http/safe-errors'
import {
  type RequestContext,
  requireHumanActorSnapshot,
} from '@/lib/requirements/auth'
import { forbiddenError } from '@/lib/requirements/errors'

export interface PrivacyUnexpectedErrorBody {
  debugMessage?: string
  error: string
}

export interface AuditActor {
  hsaId?: string
  source: RequestContext['actor']['source']
  sub?: string
}

export function assertPrivacyOfficer(context: RequestContext): void {
  if (!context.actor.roles.includes('PrivacyOfficer')) {
    throw forbiddenError('PrivacyOfficer role is required', {
      reason: 'privacy_officer_required',
    })
  }
  requireHumanActorSnapshot(context)
}

export function auditActor(context: RequestContext): AuditActor {
  return {
    hsaId: context.actor.hsaId ?? undefined,
    source: context.actor.source,
    sub: context.actor.id ?? undefined,
  }
}

export function unexpectedErrorBody(
  message: string,
  error: unknown,
): PrivacyUnexpectedErrorBody {
  return {
    ...(process.env.NODE_ENV === 'development'
      ? { debugMessage: redactSensitiveText(getErrorMessage(error)) }
      : {}),
    error: message,
  }
}
