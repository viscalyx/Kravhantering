import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import ErrorBoundaryTestTrigger from './ErrorBoundaryTestTrigger'
import { isErrorBoundaryTestRouteEnabled } from './test-route-helpers'

export const dynamic = 'force-dynamic'

export default async function ErrorBoundaryTestPage() {
  const requestHeaders = await headers()

  if (!isErrorBoundaryTestRouteEnabled(requestHeaders)) {
    notFound()
  }

  return (
    <ErrorBoundaryTestTrigger message="Test-only route error boundary trigger" />
  )
}
