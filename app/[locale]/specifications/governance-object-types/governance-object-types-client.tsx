'use client'

import { useLocale, useTranslations } from 'next-intl'
import CrudAdminPanel, {
  type CrudAdminColumn,
} from '@/components/CrudAdminPanel'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'

const GOVERNANCE_OBJECT_TYPES_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'governanceObjectTypes.overview.body',
      headingKey: 'governanceObjectTypes.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'governanceObjectTypes.manage.body',
      headingKey: 'governanceObjectTypes.manage.heading',
    },
  ],
  titleKey: 'governanceObjectTypes.title',
}

interface GovernanceObjectType {
  id: number
  nameEn: string
  nameSv: string
}

interface GovernanceObjectTypeForm {
  nameEn: string
  nameSv: string
}

const getInitialForm = (): GovernanceObjectTypeForm => ({
  nameEn: '',
  nameSv: '',
})

const toForm = (item: GovernanceObjectType): GovernanceObjectTypeForm => ({
  nameEn: item.nameEn,
  nameSv: item.nameSv,
})

const toPayload = (form: GovernanceObjectTypeForm) => form

export default function GovernanceObjectTypesClient() {
  useHelpContent(GOVERNANCE_OBJECT_TYPES_HELP)
  const t = useTranslations('governanceObjectTypeMgmt')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()

  const getName = (item: GovernanceObjectType) =>
    locale === 'sv' ? item.nameSv : item.nameEn

  const controller = useCrudAdminResource<
    GovernanceObjectType,
    GovernanceObjectTypeForm
  >({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/specification-governance-object-types',
    errorMessage: tc('error'),
    getInitialForm,
    listKey: 'governanceObjectTypes',
    toForm,
    toPayload,
  })

  const columns: CrudAdminColumn<GovernanceObjectType>[] = [
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
      devContext="governance object types"
      emptyStateMessage={t('emptyState')}
      renderFormFields={({ disabled, form, inputClassName, setForm }) => (
        <>
          <div>
            <FieldLabelWithHelp
              help={t('nameSvHelp')}
              htmlFor="governance-object-type-name-sv"
              label={t('nameSvLabel')}
              required
            />
            <input
              className={inputClassName}
              disabled={disabled}
              id="governance-object-type-name-sv"
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
              htmlFor="governance-object-type-name-en"
              label={t('nameEnLabel')}
              required
            />
            <input
              className={inputClassName}
              disabled={disabled}
              id="governance-object-type-name-en"
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
      title={tn('governanceObjectTypes')}
    />
  )
}
