import { headers } from 'next/headers'
import { getSession, isSignedIn } from '@/lib/auth/session'
import { resolveRequestCorrelationIds } from '@/lib/observability/request-ids'
import type { RequestContext } from '@/lib/requirements/auth'

export async function createServerComponentRequestContext({
  method = 'GET',
  path,
}: {
  method?: string
  path: string
}): Promise<RequestContext> {
  const requestHeaders = await headers()
  const ids = resolveRequestCorrelationIds(new Headers(requestHeaders))
  const session = await getSession()
  const actor = isSignedIn(session)
    ? {
        displayName: session.name,
        hsaId: session.hsaId,
        id: session.sub,
        isAuthenticated: true,
        roles: [...session.roles],
        source: 'oidc' as const,
      }
    : {
        displayName: '',
        hsaId: null,
        id: null,
        isAuthenticated: false,
        roles: [],
        source: 'anonymous' as const,
      }

  const userAgent = requestHeaders.get('user-agent')

  return {
    actor,
    correlationId: ids.correlationId,
    request: {
      method,
      path,
      requestId: ids.requestId,
      ...(userAgent ? { userAgent } : {}),
    },
    requestId: ids.requestId,
    source: 'rest',
  }
}
