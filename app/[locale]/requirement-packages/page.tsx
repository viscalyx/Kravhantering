import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import RequirementPackagesClient from './requirement-packages-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('requirementPackages') }
}

export default function RequirementPackagesPage() {
  return <RequirementPackagesClient />
}
