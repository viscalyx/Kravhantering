import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import GovernanceObjectTypesClient from './governance-object-types-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('governanceObjectTypes') }
}

export default function GovernanceObjectTypesPage() {
  return <GovernanceObjectTypesClient />
}
