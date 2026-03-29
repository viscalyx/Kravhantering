'use client'

import type { ReactNode } from 'react'

export interface DeveloperModeProviderProps {
  children: ReactNode
  labels: {
    badge: string
    copied: string
    copyFailed: string
  }
  navigationKey?: string | null
}

export default function DeveloperModeProvider({
  children,
}: DeveloperModeProviderProps) {
  return <>{children}</>
}
