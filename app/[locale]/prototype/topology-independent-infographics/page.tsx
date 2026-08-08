import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import InfographicPrototypeClient from './prototype-client'

export default function TopologyIndependentInfographicsPrototypePage() {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }

  return (
    <Suspense fallback={null}>
      <InfographicPrototypeClient />
    </Suspense>
  )
}
