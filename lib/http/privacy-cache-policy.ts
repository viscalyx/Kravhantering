import { noStore } from '@/lib/http/cache-control'

const NO_STORE_PRIVACY_MUTATIONS = new Set([
  'POST /api/privacy/data-subject-export',
  'POST /api/privacy/erasure-preview',
  'POST /api/privacy/erasure-requests',
])

function requestPolicyKey(request: Pick<Request, 'method' | 'url'>): string {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '')
  return `${request.method.toUpperCase()} ${pathname}`
}

export function applyPrivacyResponseCachePolicy<T extends Response>(
  request: Pick<Request, 'method' | 'url'>,
  response: T,
): T {
  return NO_STORE_PRIVACY_MUTATIONS.has(requestPolicyKey(request))
    ? noStore(response)
    : response
}
