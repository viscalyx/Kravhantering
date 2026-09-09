import {
  applyRestResponsePolicy,
  brandRouteHandler,
} from '@/lib/http/response-policy'
import { resolveRestPolicy } from '@/lib/http/route-security-policy'

/** Native browser telemetry is anonymous even when the browser attaches cookies. */
export function nativeCspReportRoute(
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  const route = async (request: Request): Promise<Response> => {
    const policy = resolveRestPolicy(request)
    if (
      policy.method !== 'POST' ||
      policy.template !== '/api/security/csp-reports' ||
      policy.csrf !== 'native-csp-report' ||
      policy.auth !== 'public'
    ) {
      return applyRestResponsePolicy(
        request,
        new Response(null, { status: 403 }),
      )
    }
    return applyRestResponsePolicy(request, await handler(request))
  }
  return brandRouteHandler(route, 'native-csp-report')
}
