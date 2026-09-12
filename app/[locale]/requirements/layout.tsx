import { type ReactNode, Suspense } from 'react'
import PrototypeSwitcher from '@/components/PrototypeSwitcher'
import './_prototype-1348/prototype.css'

// Throwaway #1348: retain the real requirements routes and their auth/data.
export default function PrototypeRequirementsLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <>
      {children}
      {process.env.NODE_ENV !== 'production' &&
        process.env.NEXT_PUBLIC_DETAIL_PROTOTYPE === 'true' && (
          <Suspense>
            <PrototypeSwitcher />
          </Suspense>
        )}
    </>
  )
}
