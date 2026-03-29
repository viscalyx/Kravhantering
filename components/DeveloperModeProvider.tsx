'use client'

import AppDeveloperModeProvider from '@viscalyx/developer-mode-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { usePathname } from '@/i18n/routing'

export default function DeveloperModeProvider({
  children,
}: {
  children: ReactNode
}) {
  const pathname = usePathname()
  const t = useTranslations('developerMode')

  return (
    <AppDeveloperModeProvider
      labels={{
        badge: t('badge'),
        copied: t('copied'),
        copyFailed: t('copyFailed'),
      }}
      navigationKey={pathname}
    >
      {children}
    </AppDeveloperModeProvider>
  )
}
