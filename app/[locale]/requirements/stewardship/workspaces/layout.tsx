import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

interface StewardshipWorkspacesLayoutProps {
  children: ReactNode
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('stewardship') }
}

export default function StewardshipWorkspacesLayout({
  children,
}: StewardshipWorkspacesLayoutProps) {
  return children
}
