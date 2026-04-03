'use client'

import { useTranslations } from 'next-intl'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import RequirementForm from '@/components/RequirementForm'

const NEW_REQUIREMENT_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'newRequirement.form.body',
      headingKey: 'newRequirement.form.heading',
    },
    {
      kind: 'text',
      bodyKey: 'newRequirement.lifecycle.body',
      headingKey: 'newRequirement.lifecycle.heading',
    },
  ],
  titleKey: 'newRequirement.title',
}

export default function NewRequirementClient() {
  useHelpContent(NEW_REQUIREMENT_HELP)
  const t = useTranslations('requirement')

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100 mb-6">
          {t('newRequirement')}
        </h1>
        <div className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm p-6">
          <RequirementForm mode="create" />
        </div>
      </div>
    </div>
  )
}
