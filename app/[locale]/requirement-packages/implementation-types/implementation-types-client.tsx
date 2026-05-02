'use client'

import { useLocale, useTranslations } from 'next-intl'
import CrudAdminPanel, {
  type CrudAdminColumn,
} from '@/components/CrudAdminPanel'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'

const IMPLEMENTATION_TYPES_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'implementationTypes.overview.body',
      headingKey: 'implementationTypes.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'implementationTypes.manage.body',
      headingKey: 'implementationTypes.manage.heading',
    },
  ],
  titleKey: 'implementationTypes.title',
}

interface ImplementationType {
  id: number
  nameEn: string
  nameSv: string
}

interface ImplementationTypeForm {
  nameEn: string
  nameSv: string
}

const getInitialForm = (): ImplementationTypeForm => ({
  nameEn: '',
  nameSv: '',
})

const toForm = (item: ImplementationType): ImplementationTypeForm => ({
  nameEn: item.nameEn,
  nameSv: item.nameSv,
})

const toPayload = (form: ImplementationTypeForm) => form

export default function ImplementationTypesClient() {
  useHelpContent(IMPLEMENTATION_TYPES_HELP)
  const t = useTranslations('implementationTypeMgmt')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()

  const getName = (item: ImplementationType) =>
    locale === 'sv' ? item.nameSv : item.nameEn

  const controller = useCrudAdminResource<
    ImplementationType,
    ImplementationTypeForm
  >({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/package-implementation-types',
    errorMessage: tc('error'),
    getInitialForm,
    listKey: 'types',
    toForm,
    toPayload,
  })

  const columns: CrudAdminColumn<ImplementationType>[] = [
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
      devContext="implementation types"
      renderFormFields={({ disabled, form, inputClassName, setForm }) => (
        <>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="it-name-sv"
            >
              {t('name')} (SV) *
            </label>
            <input
              className={inputClassName}
              disabled={disabled}
              id="it-name-sv"
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
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="it-name-en"
            >
              {t('name')} (EN) *
            </label>
            <input
              className={inputClassName}
              disabled={disabled}
              id="it-name-en"
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
      title={tn('implementationTypes')}
    />
  )
}
