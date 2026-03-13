import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import VersionDetailClient from './version-detail-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common')
  return { title: t('version') }
}

type Params = Promise<{ id: string; version: string }>

export default async function VersionDetailPage({
  params,
}: {
  params: Params
}) {
  const { id, version } = await params
  return (
    <VersionDetailClient
      requirementId={Number(id)}
      versionNumber={Number(version)}
    />
  )
}
