import { notFound } from 'next/navigation'

export default function AdminErrorBoundaryTestPage() {
  if (process.env.ENABLE_ERROR_BOUNDARY_TEST_ROUTE !== '1') {
    notFound()
  }

  throw new Error('Test-only admin error boundary trigger')
}
