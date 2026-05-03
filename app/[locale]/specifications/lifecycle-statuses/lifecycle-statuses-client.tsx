'use client'

import { useLocale, useTranslations } from 'next-intl'
import CrudAdminPanel, {
  type CrudAdminColumn,
} from '@/components/CrudAdminPanel'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
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

  const getName = (item: LifecycleStatus) =>
    locale === 'sv' ? item.nameSv : item.nameEn

  const controller = useCrudAdminResource<LifecycleStatus, LifecycleStatusForm>(
    {
      confirmDeleteMessage: tc('confirm'),
      endpoint: '/api/specification-lifecycle-statuses',
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
            <FieldLabelWithHelp
              help={t('nameSvHelp')}
              htmlFor="ls-name-sv"
              label={t('nameSvLabel')}
              required
            />
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
            <FieldLabelWithHelp
              help={t('nameEnHelp')}
              htmlFor="ls-name-en"
              label={t('nameEnLabel')}
              required
            />
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
