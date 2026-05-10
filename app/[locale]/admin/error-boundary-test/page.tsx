import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import ErrorBoundaryTestTrigger from '../../error-boundary-test/ErrorBoundaryTestTrigger'

export const dynamic = 'force-dynamic'

export default async function AdminErrorBoundaryTestPage() {
  await headers()

  if (process.env.ENABLE_ERROR_BOUNDARY_TEST_ROUTE !== '1') {
    notFound()
  }

  return (
    <ErrorBoundaryTestTrigger message="Test-only admin error boundary trigger" />
  )
}
