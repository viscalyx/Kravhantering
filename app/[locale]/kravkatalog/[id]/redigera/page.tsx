import type { Metadata } from 'next'
import EditRequirementClient from './edit-requirement-client'

export const metadata: Metadata = { title: 'Redigera krav' }

type Params = Promise<{ id: string }>

export default async function EditRequirementPage({
  params,
}: {
  params: Params
}) {
  const { id } = await params
  return <EditRequirementClient requirementId={Number(id)} />
}
