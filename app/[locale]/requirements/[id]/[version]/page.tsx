import type { Metadata } from 'next'
import { getSession, isSignedIn } from '@/lib/auth/session'
import RequirementDetailClient from '../requirement-detail-client'
import { requirementMetadata } from '../requirement-metadata'

type PageProps = {
  params: Promise<{ id: string; locale: string; version: string }>
  searchParams: Promise<{ versionId?: string }>
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { id, locale, version } = await params
  const { versionId } = await searchParams
  return requirementMetadata({ id, locale, version, versionId })
}

export default async function RequirementVersionPage({
  params,
  searchParams,
}: PageProps) {
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
