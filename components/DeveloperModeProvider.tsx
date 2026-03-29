'use client'

import AppDeveloperModeProvider from '@viscalyx/developer-mode-react'
import type { ReactNode } from 'react'
import { usePathname } from '@/i18n/routing'

const DEVELOPER_MODE_LABELS = {
  badge: 'Developer Mode',
  copied: 'Copied',
  copyFailed: 'Copy failed',
}

export default function DeveloperModeProvider({
  children,
}: {
  children: ReactNode
}) {
  const pathname = usePathname()

  return (
    <AppDeveloperModeProvider
      labels={DEVELOPER_MODE_LABELS}
      navigationKey={pathname}
    >
      {children}
    </AppDeveloperModeProvider>
  )
}
