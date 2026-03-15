import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getUiTerminology } from '@/lib/dal/ui-settings'
import { getDb } from '@/lib/db'
import { createRequirementsLogger } from '@/lib/requirements/logging'
import { getLocalizedUiTerm, type UiLocale } from '@/lib/ui-terminology'
import VersionDetailClient from './version-detail-client'

type Params = Promise<{ id: string; locale: UiLocale; version: string }>

const logger = createRequirementsLogger()

export async function generateMetadata({
  params,
}: {
  params: Params
}): Promise<Metadata> {
  const { locale } = await params

  try {
    const { env } = await getCloudflareContext({ async: true })
    const terminology = await getUiTerminology(getDb(env.DB))
    return {
      title: getLocalizedUiTerm(terminology, 'version', locale, 'singular'),
    }
  } catch (err) {
    logger.error('version_detail_page.metadata_load_failed', {
      error: err instanceof Error ? err.message : 'Unknown metadata load error',
      locale,
      operation: 'getCloudflareContext -> getDb -> getUiTerminology',
    })
    const t = await getTranslations('common')
    return { title: t('version') }
  }
}

export default async function VersionDetailPage({
  params,
}: {
  params: Params
}) {
  const { id, version } = await params
  return (
    <VersionDetailClient
      requirementId={id}
      versionNumber={Number(version)}
    />
  )
}
