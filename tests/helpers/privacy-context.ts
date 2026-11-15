import type { RequestContext } from '@/lib/requirements/auth'

export function privacyContext(): RequestContext {
  return {
    actor: {
      displayName: 'Privacy Officer',
      hsaId: 'SE5560000001-privacy1',
      id: 'privacy-officer',
      isAuthenticated: true,
      roles: ['PrivacyOfficer'],
      source: 'oidc',
    },
    correlationId: 'privacy-test',
    requestId: 'privacy-test',
    source: 'rest',
  }
}
