import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import NewRequirementClient from './new-requirement-client'
import RequirementFormPrototype from './requirement-form.prototype'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('requirement')
  return { title: t('newRequirement') }
}

export default function NewRequirementPage() {
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.PROTOTYPE_1349 === 'true'
  ) {
    return <RequirementFormPrototype />
  }
  return <NewRequirementClient />
}
