import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import VersionDetailClient from './version-detail-client'

type Params = Promise<{ id: string; locale: 'en' | 'sv'; version: string }>

export async function generateMetadata({
  params,
}: {
  params: Params
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'requirements' })
  return {
    title: t('detailLabels.version'),
  }
}

export default async function VersionDetailPage({
  params,
}: {
  params: Params
}) {
  const { id, version } = await params
  return (
    <VersionDetailClient requirementId={id} versionNumber={Number(version)} />
  )
}
