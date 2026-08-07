import type { RequestContext } from '@/lib/requirements/auth'

export function authenticatedRestContextFixture(): RequestContext {
  return {
    actor: {
      displayName: 'Reviewer',
      hsaId: 'SE5560000001-reviewer1',
      id: 'reviewer-sub',
      isAuthenticated: true,
      roles: ['Reviewer'],
      source: 'oidc',
    },
    correlationId: 'correlation-1',
    request: {
      ip: '203.0.113.1',
      method: 'POST',
      path: '/api/admin/access-reviews/42',
      requestId: 'request-1',
    },
    requestId: 'request-1',
    source: 'rest',
  }
}
