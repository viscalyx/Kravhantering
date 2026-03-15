import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import EditRequirementClient from './edit-requirement-client'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('requirement')
  return { title: t('editRequirement') }
}

type Params = Promise<{ id: string }>

export default async function EditRequirementPage({
  params,
}: {
  params: Params
}) {
  const { id } = await params
  return <EditRequirementClient requirementId={id} />
}
