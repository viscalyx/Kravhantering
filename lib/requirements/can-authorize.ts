import type {
  AuthorizationService,
  RequestContext,
  RequirementsAction,
} from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

function isAuthorizationDenied(error: unknown): boolean {
  if (isRequirementsServiceError(error)) {
    return error.code === 'forbidden' || error.code === 'unauthorized'
  }
  if (!(error instanceof Error)) return false
  const denial = error as {
    code?: unknown
    name?: unknown
    status?: unknown
  }
  return (
    denial.status === 401 ||
    denial.status === 403 ||
    denial.code === 'unauthorized' ||
    denial.code === 'forbidden' ||
    denial.name === 'AuthorizationError' ||
    denial.name === 'NotAuthorized'
  )
}

export async function canAuthorize(
  authorization: AuthorizationService,
  action: RequirementsAction,
  context: RequestContext,
): Promise<boolean> {
  try {
    await authorization.assertAuthorized(action, context)
    return true
  } catch (error) {
    if (isAuthorizationDenied(error)) return false
    throw error
  }
}
