import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import RequirementDetailClient from './requirement-detail-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('catalog') }
}

type Params = Promise<{ id: string }>

export default async function RequirementDetailPage({
  params,
}: {
  params: Params
}) {
  const { id } = await params
  return <RequirementDetailClient requirementId={id} />
}
