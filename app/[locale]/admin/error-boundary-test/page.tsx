import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import ErrorBoundaryTestTrigger from '../../error-boundary-test/ErrorBoundaryTestTrigger'
import { isErrorBoundaryTestRouteEnabled } from '../../error-boundary-test/test-route-helpers'

export const dynamic = 'force-dynamic'

export default async function AdminErrorBoundaryTestPage() {
  const requestHeaders = await headers()

  if (!isErrorBoundaryTestRouteEnabled(requestHeaders)) {
    notFound()
  }

  return (
    <ErrorBoundaryTestTrigger message="Test-only admin error boundary trigger" />
  )
}
