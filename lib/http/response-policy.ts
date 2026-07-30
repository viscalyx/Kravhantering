import {
  isRestMethod,
  type RestCachePolicy,
  resolveRestPathPolicy,
  resolveRestPolicy,
} from '@/lib/http/route-security-policy'

const ROUTE_HANDLER_BRAND = Symbol.for(
  'kravhantering.http.route-handler-policy',
)

export type RouteHandlerBrand =
  | 'logout-mutation'
  | 'mutation'
  | 'response-policy'

type AnyRouteHandler = (...args: never[]) => unknown

type BrandedRouteHandler = AnyRouteHandler & {
  [ROUTE_HANDLER_BRAND]?: RouteHandlerBrand
}

function applyCachePolicy<T extends Response>(
  policy: RestCachePolicy,
  response: T,
): T {
  if (policy !== 'framework-default') {
    response.headers.set('Cache-Control', policy)
  }
  return response
}

export function applyRestResponsePolicy<T extends Response>(
  request: Pick<Request, 'method' | 'url'>,
  response: T,
): T {
  const supportedMethod = isRestMethod(request.method.toUpperCase())
  const operationPolicy = supportedMethod
    ? resolveRestPolicy(request)
    : resolveRestPathPolicy(request.url)
  const policy =
    operationPolicy.registered || !supportedMethod
      ? operationPolicy
      : resolveRestPathPolicy(request.url)
  return applyCachePolicy(policy.cache, response)
}

export function brandRouteHandler<T extends AnyRouteHandler>(
  handler: T,
  brand: RouteHandlerBrand,
): T {
  Object.defineProperty(handler, ROUTE_HANDLER_BRAND, {
    configurable: false,
    enumerable: false,
    value: brand,
    writable: false,
  })
  return handler
}

export function getRouteHandlerBrand(
  handler: unknown,
): RouteHandlerBrand | undefined {
  return typeof handler === 'function'
    ? (handler as BrandedRouteHandler)[ROUTE_HANDLER_BRAND]
    : undefined
}

export function withRestResponsePolicy<
  TRequest extends Request,
  TArgs extends unknown[],
>(
  handler: (request: TRequest, ...args: TArgs) => Promise<Response> | Response,
): (request: TRequest, ...args: TArgs) => Promise<Response> {
  const wrapped = async (
    request: TRequest,
    ...args: TArgs
  ): Promise<Response> => {
    const response = await handler(request, ...args)
    return applyRestResponsePolicy(request, response)
  }
  return brandRouteHandler(wrapped, 'response-policy')
}
