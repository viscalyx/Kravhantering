'use client'

import { HelpCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import CrudAdminPanel, {
  type CrudAdminColumn,
} from '@/components/CrudAdminPanel'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'

const LIFECYCLE_STATUSES_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'lifecycleStatuses.overview.body',
      headingKey: 'lifecycleStatuses.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'lifecycleStatuses.manage.body',
      headingKey: 'lifecycleStatuses.manage.heading',
    },
  ],
  titleKey: 'lifecycleStatuses.title',
}

interface LifecycleStatus {
  id: number
  nameEn: string
  nameSv: string
}

interface LifecycleStatusForm {
  nameEn: string
  nameSv: string
}

const getInitialForm = (): LifecycleStatusForm => ({
  nameEn: '',
  nameSv: '',
})

const toForm = (item: LifecycleStatus): LifecycleStatusForm => ({
  nameEn: item.nameEn,
  nameSv: item.nameSv,
})

const toPayload = (form: LifecycleStatusForm) => form

export default function LifecycleStatusesClient() {
  useHelpContent(LIFECYCLE_STATUSES_HELP)
  const t = useTranslations('lifecycleStatusMgmt')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()
  const [openHelp, setOpenHelp] = useState<Set<string>>(new Set())

  const getName = (item: LifecycleStatus) =>
    locale === 'sv' ? item.nameSv : item.nameEn

  const toggleHelp = (field: string) =>
    setOpenHelp(previousFields => {
      const nextFields = new Set(previousFields)
      if (nextFields.has(field)) nextFields.delete(field)
      else nextFields.add(field)
      return nextFields
    })

  const helpButton = (field: string, label: string) => (
    <button
      aria-controls={`help-${field}`}
      aria-expanded={openHelp.has(field)}
      aria-label={`${tc('help')}: ${label}`}
      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-secondary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      onClick={() => toggleHelp(field)}
      type="button"
    >
      <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  )

  const helpPanel = (helpKey: string, field: string) => (
    <AnimatedHelpPanel id={`help-${field}`} isOpen={openHelp.has(field)}>
      {t(helpKey)}
    </AnimatedHelpPanel>
  )

  const controller = useCrudAdminResource<LifecycleStatus, LifecycleStatusForm>(
    {
      confirmDeleteMessage: tc('confirm'),
      endpoint: '/api/package-lifecycle-statuses',
      errorMessage: tc('unexpectedError'),
      getCaughtErrorMessage: () => tc('unexpectedError'),
      getInitialForm,
      listKey: 'statuses',
      toForm,
      toPayload,
    },
  )

  const columns: CrudAdminColumn<LifecycleStatus>[] = [
    {
      className: 'py-3 px-4 font-medium',
      header: t('name'),
      key: 'name',
      render: item => getName(item),
    },
  ]

  return (
    <CrudAdminPanel
      columns={columns}
      controller={controller}
      devContext="lifecycle statuses"
      renderFormFields={({ disabled, form, inputClassName, setForm }) => (
        <>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-sm font-medium" htmlFor="ls-name-sv">
                {t('name')} (SV) *
              </label>
              {helpButton('nameSv', `${t('name')} (SV)`)}
            </div>
            {helpPanel('nameSvHelp', 'nameSv')}
            <input
              className={inputClassName}
              disabled={disabled}
              id="ls-name-sv"
              onChange={event =>
                setForm(previousForm => ({
                  ...previousForm,
                  nameSv: event.target.value,
                }))
              }
              required
              value={form.nameSv}
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-sm font-medium" htmlFor="ls-name-en">
                {t('name')} (EN) *
              </label>
              {helpButton('nameEn', `${t('name')} (EN)`)}
            </div>
            {helpPanel('nameEnHelp', 'nameEn')}
            <input
              className={inputClassName}
              disabled={disabled}
              id="ls-name-en"
              onChange={event =>
                setForm(previousForm => ({
                  ...previousForm,
                  nameEn: event.target.value,
                }))
              }
              required
              value={form.nameEn}
            />
          </div>
        </>
      )}
      title={tn('lifecycleStatuses')}
    />
  )
}
