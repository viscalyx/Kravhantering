import { NextResponse } from 'next/server'
import type { ZodType } from 'zod'
import { createAdminPrivilegedAuditContext } from '@/lib/admin/privileged-audit'
import { recordDeniedActionAuditEvent } from '@/lib/audit/action-audit'
import { CsrfError } from '@/lib/auth/csrf'
import { getRequestSqlServerDataSource, type SqlServerDatabase } from '@/lib/db'
import {
  applyRestResponsePolicy,
  brandRouteHandler,
} from '@/lib/http/response-policy'
import {
  getErrorMessage,
  logSanitizedError,
  redactSensitiveText,
} from '@/lib/http/safe-errors'
import { parseRouteParams, readJsonWithSchema } from '@/lib/http/validation'
import { scheduleActorResponsibilityPersonRefresh } from '@/lib/requirements/actor-responsibility-refresh'
import {
  createDefaultAuthorizationService,
  createRequestContext,
  type RequestContext,
  type RequirementsAction,
} from '@/lib/requirements/auth'
import {
  forbiddenError,
  internalError,
  isRequirementsServiceError,
  unauthorizedError,
} from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { recordAuthorizationDeniedAuditFailure } from '@/lib/requirements/security-audit'

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
  db?: SqlServerDatabase
  params: TParams
  request: Request
}

export interface SecureMutationPreParseArgs {
  context: RequestContext
  request: Request
}

export type SecureMutationBodyReadResult<TBody> =
  | { data: TBody; ok: true }
  | { ok: false; response: NextResponse }

export interface SecureMutationBodyReaderArgs<TParams> {
  context: RequestContext
  params: TParams
  request: Request
}

type NoInferMutation<T> = [T][T extends unknown ? 0 : never]

export interface SecureMutationRouteOptions<TBody, TParams> {
  bodyReader?: (
    args: SecureMutationBodyReaderArgs<TParams>,
  ) => Promise<SecureMutationBodyReadResult<TBody>>
  bodySchema?: ZodType<TBody>
  decorateErrorResponse?: (response: NextResponse) => NextResponse
  decorateResponse?: (response: Response) => Response
  errorMessage?: string
  handler: (
    args: SecureMutationHandlerArgs<TBody, TParams>,
  ) => Promise<Response> | Response
  paramsSchema?: ZodType<TParams>
  policy: MutationPolicy<NoInferMutation<TBody>, NoInferMutation<TParams>>
  preParse?: (
    args: SecureMutationPreParseArgs,
  ) => Promise<Response | undefined> | Response | undefined
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

interface UnexpectedErrorBody {
  debugMessage?: string
  error: string
}

function unexpectedErrorBody(
  message: string,
  error: unknown,
): UnexpectedErrorBody {
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

function decorateResponse<TBody, TParams>(
  options: SecureMutationRouteOptions<TBody, TParams>,
  request: Request,
  response: Response,
): Response {
  const decoratedResponse = options.decorateResponse?.(response) ?? response
  return applyRestResponsePolicy(request, decoratedResponse)
}

function decorateErrorResponse<TBody, TParams>(
  options: SecureMutationRouteOptions<TBody, TParams>,
  request: Request,
  response: NextResponse,
): Response {
  const decoratedError = options.decorateErrorResponse?.(response) ?? response
  return decorateResponse(options, request, decoratedError)
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
    args.db ??= await getRequestSqlServerDataSource()
    await createDefaultAuthorizationService(args.db).assertAuthorized(
      action,
      args.context,
    )
    return
  }

  await policy.authorize(args)
}

async function recordAuthorizationDeniedForPolicy<TBody, TParams>(
  policy: MutationPolicy<TBody, TParams>,
  context: RequestContext,
  error: unknown,
  db?: SqlServerDatabase,
): Promise<void> {
  if (
    !isRequirementsServiceError(error) ||
    (error.code !== 'forbidden' && error.code !== 'unauthorized')
  ) {
    return
  }

  const reason =
    typeof error.details?.reason === 'string'
      ? error.details.reason
      : error.code
  try {
    const auditDb = db ?? (await getRequestSqlServerDataSource())
    await recordDeniedActionAuditEvent(auditDb, context, {
      action:
        policy.kind === 'admin'
          ? 'admin.authorization.denied'
          : policy.kind === 'custom'
            ? `${policy.name}.denied`
            : 'requirements.authorization.denied',
      denialReason: reason,
      details: {
        errorCode: error.code,
        policyKind: policy.kind,
        requestSource: context.source,
      },
      targetKind: policy.kind,
    })
  } catch (auditError) {
    recordAuthorizationDeniedAuditFailure(context, auditError, {
      errorCode: error.code,
      policyKind: policy.kind,
      reason,
    })
    throw internalError()
  }
}

async function authorizationErrorResponse<TBody, TParams>(
  policy: MutationPolicy<TBody, TParams>,
  context: RequestContext,
  error: unknown,
  errorMessage: string,
  db?: SqlServerDatabase,
): Promise<NextResponse> {
  try {
    await recordAuthorizationDeniedForPolicy(policy, context, error, db)
    return errorResponse(errorMessage, error)
  } catch (auditError) {
    return errorResponse(errorMessage, auditError)
  }
}

export function secureMutationRoute<TBody = undefined, TParams = undefined>(
  options: SecureMutationRouteOptions<TBody, TParams>,
): MutationRouteHandler {
  const route: MutationRouteHandler = async (request, routeContext) => {
    const errorMessage = options.errorMessage ?? 'Failed to process mutation'
    let context: RequestContext

    try {
      context = await createMutationContext(request, options.policy)
    } catch (error) {
      return decorateErrorResponse(
        options,
        request,
        errorResponse(errorMessage, error),
      )
    }

    try {
      requireAuthenticated(context)
      const preParseResponse = await options.preParse?.({ context, request })
      if (preParseResponse) {
        return decorateResponse(options, request, preParseResponse)
      }
    } catch (error) {
      const response = await authorizationErrorResponse(
        options.policy,
        context,
        error,
        errorMessage,
      )
      return decorateErrorResponse(options, request, response)
    }

    const parsedParams =
      options.paramsSchema && routeContext?.params
        ? await parseRouteParams(routeContext.params, options.paramsSchema)
        : ({ data: undefined as TParams, ok: true } as const)
    if (!parsedParams.ok) {
      return decorateErrorResponse(options, request, parsedParams.response)
    }

    let parsedBody: SecureMutationBodyReadResult<TBody>
    try {
      parsedBody = options.bodyReader
        ? await options.bodyReader({
            context,
            params: parsedParams.data,
            request,
          })
        : options.bodySchema
          ? await readJsonWithSchema(request, options.bodySchema)
          : ({ data: undefined as TBody, ok: true } as const)
    } catch (error) {
      return decorateErrorResponse(
        options,
        request,
        errorResponse(errorMessage, error),
      )
    }
    if (!parsedBody.ok) {
      return decorateErrorResponse(options, request, parsedBody.response)
    }

    const args: SecureMutationHandlerArgs<TBody, TParams> = {
      body: parsedBody.data,
      context,
      params: parsedParams.data,
      request,
    }

    try {
      await authorizeMutation(options.policy, args)
    } catch (error) {
      const response = await authorizationErrorResponse(
        options.policy,
        context,
        error,
        errorMessage,
        args.db,
      )
      return decorateErrorResponse(options, request, response)
    }

    try {
      const response = await options.handler(args)
      if (response.ok) {
        scheduleActorResponsibilityPersonRefresh(
          () => args.db ?? getRequestSqlServerDataSource(),
          context,
        )
      }
      return decorateResponse(options, request, response)
    } catch (error) {
      return decorateErrorResponse(
        options,
        request,
        errorResponse(errorMessage, error),
      )
    }
  }
  return brandRouteHandler(route, 'mutation')
}

export function secureLogoutMutationRoute(
  handler: (request: Request) => Promise<Response> | Response,
): MutationRouteHandler {
  const route: MutationRouteHandler = async request => {
    try {
      await createRequestContext(request, 'rest')
      return applyRestResponsePolicy(request, await handler(request))
    } catch (error) {
      return applyRestResponsePolicy(
        request,
        errorResponse('Failed to logout', error),
      )
    }
  }
  return brandRouteHandler(route, 'logout-mutation')
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

export function authenticatedMutationPolicy<TBody = unknown, TParams = unknown>(
  name: string,
): MutationPolicy<TBody, TParams> {
  return customMutationPolicy(name, ({ context }) => {
    if (!context.actor?.isAuthenticated) {
      throw unauthorizedError()
    }
  })
}
