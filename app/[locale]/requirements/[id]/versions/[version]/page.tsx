import type { Metadata } from 'next'
import { getUiTerminology } from '@/lib/dal/ui-settings'
import { getRequestDatabaseConnection } from '@/lib/db'
import { getLocalizedUiTerm, type UiLocale } from '@/lib/ui-terminology'
import VersionDetailClient from './version-detail-client'

type Params = Promise<{ id: string; locale: UiLocale; version: string }>

export async function generateMetadata({
  params,
}: {
  params: Params
}): Promise<Metadata> {
  const { locale } = await params
  const terminology = await getUiTerminology(
    await getRequestDatabaseConnection(),
  )
  return {
    title: getLocalizedUiTerm(terminology, 'version', locale, 'singular'),
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
