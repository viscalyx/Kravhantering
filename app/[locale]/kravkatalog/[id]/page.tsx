import type { Metadata } from 'next'
import RequirementDetailClient from './requirement-detail-client'

export const metadata: Metadata = { title: 'Krav' }

type Params = Promise<{ id: string }>

export default async function RequirementDetailPage({
  params,
}: {
  params: Params
}) {
  const { id } = await params
  return <RequirementDetailClient requirementId={Number(id)} />
}
