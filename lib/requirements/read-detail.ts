import type {
  AuthorizationService,
  RequestContext,
  RequirementsAction,
} from '@/lib/requirements/auth'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import type { RequirementsRuntime } from '@/lib/requirements/server'
import type { RequirementRefInput } from '@/lib/requirements/service'

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

export async function readRequirementDetail(
  {
    authorization,
    service,
  }: Pick<RequirementsRuntime, 'authorization' | 'service'>,
  context: RequestContext,
  ref: RequirementRefInput,
) {
  const canViewHistory = await canAuthorize(
    authorization,
    { ...ref, kind: 'get_requirement', view: 'history' },
    context,
  )
  const { requirement } = await service.getRequirement(context, {
    ...ref,
    view: canViewHistory ? 'history' : 'detail',
  })
  return { canViewHistory, requirement }
}
