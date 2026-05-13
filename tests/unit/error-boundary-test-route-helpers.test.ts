import { afterEach, describe, expect, it, vi } from 'vitest'
import { isErrorBoundaryTestRouteEnabled } from '@/app/[locale]/error-boundary-test/test-route-helpers'

describe('error boundary test route helper', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('blocks environment-enabled test routes in production without local-prod target', () => {
    vi.stubEnv('ENABLE_ERROR_BOUNDARY_TEST_ROUTE', '1')
    vi.stubEnv('NODE_ENV', 'production')

    expect(isErrorBoundaryTestRouteEnabled(new Headers())).toBe(false)
  })

  it('blocks environment-enabled test routes in real production', () => {
    vi.stubEnv('ENABLE_ERROR_BOUNDARY_TEST_ROUTE', '1')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('BUILD_TARGET', 'prod')

    expect(isErrorBoundaryTestRouteEnabled(new Headers())).toBe(false)
  })

  it('allows environment-enabled test routes for local-prod validation', () => {
    vi.stubEnv('ENABLE_ERROR_BOUNDARY_TEST_ROUTE', '1')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('BUILD_TARGET', 'local-prod')

    expect(isErrorBoundaryTestRouteEnabled(new Headers())).toBe(true)
  })

  it('allows environment-enabled test routes outside production', () => {
    vi.stubEnv('ENABLE_ERROR_BOUNDARY_TEST_ROUTE', '1')
    vi.stubEnv('NODE_ENV', 'test')

    expect(isErrorBoundaryTestRouteEnabled(new Headers())).toBe(true)
  })

  it('allows the development-only request header', () => {
    vi.stubEnv('NODE_ENV', 'development')

    expect(
      isErrorBoundaryTestRouteEnabled(
        new Headers({ 'x-error-boundary-test': '1' }),
      ),
    ).toBe(true)
  })
})
