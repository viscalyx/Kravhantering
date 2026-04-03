import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import NewRequirementClient from './new-requirement-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('requirement')
  return { title: t('newRequirement') }
}

export default function NewRequirementPage() {
  return <NewRequirementClient />
}
