import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AdminErrorBoundaryTestPage() {
  await headers()

  if (process.env.ENABLE_ERROR_BOUNDARY_TEST_ROUTE !== '1') {
    notFound()
  }

  throw new Error('Test-only admin error boundary trigger')
}
