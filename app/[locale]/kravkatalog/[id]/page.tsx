import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import RequirementDetailClient from './requirement-detail-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('catalog') }
}

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ v?: string }>

export default async function RequirementDetailPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const { id } = await params
  const { v } = await searchParams
  const version = v ? Number(v) : undefined
  return (
    <RequirementDetailClient
      requirementId={id}
      defaultVersion={Number.isNaN(version) ? undefined : version}
    />
  )
}
