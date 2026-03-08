import type { Metadata } from 'next'
import VersionDetailClient from './version-detail-client'

export const metadata: Metadata = { title: 'Version' }

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
