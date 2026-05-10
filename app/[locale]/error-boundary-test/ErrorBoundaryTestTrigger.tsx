'use client'

import { useEffect, useState } from 'react'

interface ComponentProps {
  message: string
}

export default function ErrorBoundaryTestTrigger({ message }: ComponentProps) {
  const [shouldThrow, setShouldThrow] = useState(false)

  useEffect(() => {
    setShouldThrow(true)
  }, [])

  // useEffect calls setShouldThrow, then shouldThrow makes render throw
  // Error(message), which lets the error boundary catch this test failure.
  if (shouldThrow) {
    throw new Error(message)
  }

  return null
}
