import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import RequirementPackageDetailClient from './requirement-package-detail-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('packages') }
}

type Params = Promise<{ slug: string }>

export default async function KravpaketDetailPage({
  params,
}: {
  params: Params
}) {
  const { slug } = await params
  return <RequirementPackageDetailClient packageSlug={slug} />
}
