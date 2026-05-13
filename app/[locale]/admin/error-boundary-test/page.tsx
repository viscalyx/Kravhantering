import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import ErrorBoundaryTestTrigger from '../../error-boundary-test/ErrorBoundaryTestTrigger'

export const dynamic = 'force-dynamic'

function isErrorBoundaryTestRouteEnabled(requestHeaders: Headers) {
  return (
    process.env.ENABLE_ERROR_BOUNDARY_TEST_ROUTE === '1' ||
    (process.env.NODE_ENV === 'development' &&
      requestHeaders.get('x-error-boundary-test') === '1')
  )
}

export default async function AdminErrorBoundaryTestPage() {
  const requestHeaders = await headers()

  if (!isErrorBoundaryTestRouteEnabled(requestHeaders)) {
    notFound()
  }

  return (
    <ErrorBoundaryTestTrigger message="Test-only admin error boundary trigger" />
  )
}
