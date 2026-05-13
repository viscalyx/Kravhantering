export function isErrorBoundaryTestRouteEnabled(requestHeaders: Headers) {
  const isRealProductionRuntime =
    process.env.NODE_ENV === 'production' &&
    process.env.BUILD_TARGET !== 'local-prod'
  const isExplicitlyEnabledOutsideRealProduction =
    process.env.ENABLE_ERROR_BOUNDARY_TEST_ROUTE === '1' &&
    !isRealProductionRuntime

  return (
    // The env gate is allowed for local-prod validation, but not real prod.
    isExplicitlyEnabledOutsideRealProduction ||
    (process.env.NODE_ENV === 'development' &&
      requestHeaders.get('x-error-boundary-test') === '1')
  )
}
