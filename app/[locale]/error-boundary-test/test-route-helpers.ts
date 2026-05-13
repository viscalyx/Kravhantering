export function isErrorBoundaryTestRouteEnabled(requestHeaders: Headers) {
  const isExplicitlyEnabledOutsideProduction =
    process.env.ENABLE_ERROR_BOUNDARY_TEST_ROUTE === '1' &&
    process.env.NODE_ENV !== 'production'

  return (
    // Test-only routes must never be enabled by configuration in production.
    isExplicitlyEnabledOutsideProduction ||
    (process.env.NODE_ENV === 'development' &&
      requestHeaders.get('x-error-boundary-test') === '1')
  )
}
