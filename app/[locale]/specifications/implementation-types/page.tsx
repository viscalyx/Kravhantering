import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import ImplementationTypesClient from './implementation-types-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('implementationTypes') }
}

export default function ImplementationTypesPage() {
  return <ImplementationTypesClient />
}
