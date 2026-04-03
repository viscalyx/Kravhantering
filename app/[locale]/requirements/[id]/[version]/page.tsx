import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import RequirementDetailClient from '../requirement-detail-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('catalog') }
}

type Params = Promise<{ id: string; version: string }>

export default async function RequirementVersionPage({
  params,
}: {
  params: Params
}) {
  const { id, version } = await params
  const versionNumber = Number(version)
  return (
    <RequirementDetailClient
      defaultVersion={Number.isNaN(versionNumber) ? undefined : versionNumber}
      requirementId={id}
    />
  )
}
