import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getSession, isSignedIn } from '@/lib/auth/session'
import RequirementDetailClient from '../requirement-detail-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('catalog') }
}

type Params = Promise<{ id: string; version: string }>

export default async function RequirementVersionPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: Promise<{ versionId?: string }>
}) {
  const { id, version } = await params
  const versionNumber = Number(version)
  const { versionId } = await searchParams
  const session = await getSession()
  return (
    <RequirementDetailClient
      currentActorName={isSignedIn(session) ? session.name : null}
      defaultVersion={Number.isNaN(versionNumber) ? undefined : versionNumber}
      expectedVersionId={versionId == null ? undefined : Number(versionId)}
      requirementId={id}
    />
  )
}
