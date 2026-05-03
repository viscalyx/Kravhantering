import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import RequirementsSpecificationDetailClient from './requirements-specification-detail-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('specifications') }
}

type Params = Promise<{ slug: string }>

export default async function RequirementsSpecificationDetailPage({
  params,
}: {
  params: Params
}) {
  const { slug } = await params
  return <RequirementsSpecificationDetailClient specificationSlug={slug} />
}
