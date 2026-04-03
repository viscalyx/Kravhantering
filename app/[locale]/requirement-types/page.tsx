import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import RequirementTypesClient from './requirement-types-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('types') }
}

export default function RequirementTypesPage() {
  return <RequirementTypesClient />
}
