import { NextRequest } from 'next/server'
import type { MutationRouteHandler } from '@/lib/http/secure-mutation-route'
import type { RequestContext } from '@/lib/requirements/auth'

export const authenticatedRouteContext: RequestContext = {
  actor: {
    displayName: 'Route Test Actor',
    hsaId: 'SE5560000001-actor',
    id: 'route-test',
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

export function jsonRequest(
  path: string,
  body: Record<string, unknown>,
): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
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
