import type { Metadata } from 'next'
import { getSession, isSignedIn } from '@/lib/auth/session'
import RequirementDetailClient from './requirement-detail-client'
import { requirementMetadata } from './requirement-metadata'

type Params = Promise<{ id: string }>

export async function generateMetadata({
  params,
}: {
  params: Params
}): Promise<Metadata> {
  return requirementMetadata(await params)
}

export default async function RequirementDetailPage({
  params,
}: {
  params: Params
}) {
  const { id } = await params
  const session = await getSession()
  return (
    <RequirementDetailClient
      currentActorName={isSignedIn(session) ? session.name : null}
      requirementId={id}
    />
  )
}
