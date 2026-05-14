import { NextResponse } from 'next/server'
import type { ZodType } from 'zod'
import { createAdminPrivilegedAuditContext } from '@/lib/admin/privileged-audit'
import { CsrfError } from '@/lib/auth/csrf'
import {
  getErrorMessage,
  logSanitizedError,
  redactSensitiveText,
} from '@/lib/http/safe-errors'
import { parseRouteParams, readJsonWithSchema } from '@/lib/http/validation'
import {
  createDefaultAuthorizationService,
  createRequestContext,
  type RequestContext,
  type RequirementsAction,
} from '@/lib/requirements/auth'
import {
  forbiddenError,
  isRequirementsServiceError,
  unauthorizedError,
} from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'

export type MutationRouteContext = {
  params?: Promise<unknown>
}

export type MutationRouteHandler = (
  request: Request,
  routeContext?: MutationRouteContext,
) => Promise<Response>

export type MutationPolicy<TBody, TParams> =
  | {
      kind: 'admin'
      roles?: readonly string[]
    }
  | {
      action:
        | RequirementsAction
        | ((
            args: SecureMutationHandlerArgs<TBody, TParams>,
          ) => Promise<RequirementsAction> | RequirementsAction)
      kind: 'requirements'
    }
  | {
      authorize: (
        args: SecureMutationHandlerArgs<TBody, TParams>,
      ) => Promise<void> | void
      kind: 'custom'
      name: string
    }

export interface SecureMutationHandlerArgs<TBody, TParams> {
  body: TBody
  context: RequestContext
  params: TParams
  request: Request
}

type NoInferMutation<T> = [T][T extends unknown ? 0 : never]

export interface SecureMutationRouteOptions<TBody, TParams> {
  bodySchema?: ZodType<TBody>
  decorateErrorResponse?: (response: NextResponse) => NextResponse
  errorMessage?: string
  handler: (
    args: SecureMutationHandlerArgs<TBody, TParams>,
  ) => Promise<Response> | Response
  paramsSchema?: ZodType<TParams>
  policy: MutationPolicy<NoInferMutation<TBody>, NoInferMutation<TParams>>
}

async function createMutationContext<TBody, TParams>(
  request: Request,
  policy: MutationPolicy<TBody, TParams>,
): Promise<RequestContext> {
  if (policy.kind === 'admin') {
    return createAdminPrivilegedAuditContext(request)
  }

  return createRequestContext(request, 'rest')
}

function unexpectedErrorBody(message: string, error: unknown) {
  return {
    ...(process.env.NODE_ENV === 'development'
      ? { debugMessage: redactSensitiveText(getErrorMessage(error)) }
      : {}),
    error: message,
  }
}

function errorResponse(message: string, error: unknown): NextResponse {
  if (error instanceof CsrfError || isRequirementsServiceError(error)) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }

  logSanitizedError(message, error)
  return NextResponse.json(unexpectedErrorBody(message, error), {
    status: 500,
  })
}

function decorateErrorResponse<TBody, TParams>(
  options: SecureMutationRouteOptions<TBody, TParams>,
  response: NextResponse,
): NextResponse {
  return options.decorateErrorResponse?.(response) ?? response
}

function requireAuthenticated(context: RequestContext): void {
  if (!context.actor?.isAuthenticated) {
    throw unauthorizedError()
  }
}

async function authorizeMutation<TBody, TParams>(
  policy: MutationPolicy<TBody, TParams>,
  args: SecureMutationHandlerArgs<TBody, TParams>,
): Promise<void> {
  requireAuthenticated(args.context)

  if (policy.kind === 'admin') {
    const roles = policy.roles ?? ['Admin']
    const actorRoles = args.context.actor?.roles ?? []
    if (!roles.some(role => actorRoles.includes(role))) {
      throw forbiddenError('Missing required role for admin mutation', {
        actorRoles,
        reason: 'required_role_missing',
        requiredRoles: roles,
      })
    }
    return
  }

  if (policy.kind === 'requirements') {
    const action =
      typeof policy.action === 'function'
        ? await policy.action(args)
        : policy.action
    await createDefaultAuthorizationService().assertAuthorized(
      action,
      args.context,
    )
    return
  }

  await policy.authorize(args)
}

export function secureMutationRoute<TBody = undefined, TParams = undefined>(
  options: SecureMutationRouteOptions<TBody, TParams>,
): MutationRouteHandler {
  return async (request, routeContext) => {
    const errorMessage = options.errorMessage ?? 'Failed to process mutation'
    let context: RequestContext

    try {
      context = await createMutationContext(request, options.policy)
    } catch (error) {
      return decorateErrorResponse(options, errorResponse(errorMessage, error))
    }

    const parsedParams =
      options.paramsSchema && routeContext?.params
        ? await parseRouteParams(routeContext.params, options.paramsSchema)
        : ({ data: undefined as TParams, ok: true } as const)
    if (!parsedParams.ok) {
      return (
        options.decorateErrorResponse?.(parsedParams.response) ??
        parsedParams.response
      )
    }

    const parsedBody = options.bodySchema
      ? await readJsonWithSchema(request, options.bodySchema)
      : ({ data: undefined as TBody, ok: true } as const)
    if (!parsedBody.ok) {
      return (
        options.decorateErrorResponse?.(parsedBody.response) ??
        parsedBody.response
      )
    }

    const args: SecureMutationHandlerArgs<TBody, TParams> = {
      body: parsedBody.data,
      context,
      params: parsedParams.data,
      request,
    }

    try {
      await authorizeMutation(options.policy, args)
      return await options.handler(args)
    } catch (error) {
      return decorateErrorResponse(options, errorResponse(errorMessage, error))
    }
  }
}

export function secureLogoutMutationRoute(
  handler: (request: Request) => Promise<Response> | Response,
): MutationRouteHandler {
  return async request => {
    try {
      await createRequestContext(request, 'rest')
      return await handler(request)
    } catch (error) {
      return errorResponse('Failed to logout', error)
    }
  }
}

export function adminMutationPolicy<TBody = unknown, TParams = unknown>(
  roles: readonly string[] = ['Admin'],
): MutationPolicy<TBody, TParams> {
  return { kind: 'admin', roles }
}

export function requirementsMutationPolicy<TBody = unknown, TParams = unknown>(
  action:
    | RequirementsAction
    | ((
        args: SecureMutationHandlerArgs<TBody, TParams>,
      ) => Promise<RequirementsAction> | RequirementsAction),
): MutationPolicy<TBody, TParams> {
  return { action, kind: 'requirements' }
}

export function customMutationPolicy<TBody = unknown, TParams = unknown>(
  name: string,
  authorize: (
    args: SecureMutationHandlerArgs<TBody, TParams>,
  ) => Promise<void> | void,
): MutationPolicy<TBody, TParams> {
  return { authorize, kind: 'custom', name }
}
