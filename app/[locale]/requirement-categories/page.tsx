import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import RequirementCategoriesClient from './requirement-categories-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('categories') }
}

export default function RequirementCategoriesPage() {
  return <RequirementCategoriesClient />
}
