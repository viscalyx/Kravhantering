import { NextRequest } from 'next/server'
import type { MutationRouteHandler } from '@/lib/http/secure-mutation-route'
import type { RequestContext } from '@/lib/requirements/auth'

export const authenticatedRouteContext: RequestContext = {
  actor: {
    displayName: 'Issue 891 Actor',
    hsaId: 'SE5560000001-actor',
    id: 'issue-891',
    isAuthenticated: true,
    roles: ['Admin'],
    source: 'oidc',
  },
  correlationId: 'correlation',
  requestId: 'request',
  source: 'rest',
}

export const routeParams = (id: string) => ({
  params: Promise.resolve({ id }),
})

export function routeRequest(path = '/api/resource'): NextRequest {
  return new NextRequest(`https://example.test${path}`)
}

type MutationMethod = 'DELETE' | 'POST' | 'PUT'

export function callMutation(
  handler: MutationRouteHandler,
  path: string,
  method: MutationMethod,
  options: { body?: Record<string, unknown>; id?: string } = {},
): Promise<Response> {
  const request = new NextRequest(`https://example.test${path}`, {
    ...(options.body
      ? {
          body: JSON.stringify(options.body),
          headers: { 'content-type': 'application/json' },
        }
      : {}),
    method,
  })
  return handler(
    request,
    options.id === undefined ? undefined : routeParams(options.id),
  )
}
