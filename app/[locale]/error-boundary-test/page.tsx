import { notFound } from 'next/navigation'

export default function ErrorBoundaryTestPage() {
  if (process.env.ENABLE_ERROR_BOUNDARY_TEST_ROUTE !== '1') {
    notFound()
  }

  throw new Error('Test-only route error boundary trigger')
}
