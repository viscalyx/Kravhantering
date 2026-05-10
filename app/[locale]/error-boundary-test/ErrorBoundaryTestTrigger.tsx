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

  if (shouldThrow) {
    throw new Error(message)
  }

  return null
}
