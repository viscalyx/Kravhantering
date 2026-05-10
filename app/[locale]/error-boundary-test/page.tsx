import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import ErrorBoundaryTestTrigger from './ErrorBoundaryTestTrigger'

export const dynamic = 'force-dynamic'

export default async function ErrorBoundaryTestPage() {
  await headers()

  if (process.env.ENABLE_ERROR_BOUNDARY_TEST_ROUTE !== '1') {
    notFound()
  }

  return (
    <ErrorBoundaryTestTrigger message="Test-only route error boundary trigger" />
  )
}
