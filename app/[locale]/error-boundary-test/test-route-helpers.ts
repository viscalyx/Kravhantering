export function isErrorBoundaryTestRouteEnabled(requestHeaders: Headers) {
  return (
    process.env.ENABLE_ERROR_BOUNDARY_TEST_ROUTE === '1' ||
    (process.env.NODE_ENV === 'development' &&
      requestHeaders.get('x-error-boundary-test') === '1')
  )
}
