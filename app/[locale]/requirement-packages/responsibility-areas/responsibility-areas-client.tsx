'use client'

import { useLocale, useTranslations } from 'next-intl'
import CrudAdminPanel, {
  type CrudAdminColumn,
} from '@/components/CrudAdminPanel'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'

const RESPONSIBILITY_AREAS_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'responsibilityAreas.overview.body',
      headingKey: 'responsibilityAreas.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'responsibilityAreas.manage.body',
      headingKey: 'responsibilityAreas.manage.heading',
    },
  ],
  titleKey: 'responsibilityAreas.title',
}

interface ResponsibilityArea {
  id: number
  nameEn: string
  nameSv: string
}

interface ResponsibilityAreaForm {
  nameEn: string
  nameSv: string
}

const getInitialForm = (): ResponsibilityAreaForm => ({
  nameEn: '',
  nameSv: '',
})

const toForm = (item: ResponsibilityArea): ResponsibilityAreaForm => ({
  nameEn: item.nameEn,
  nameSv: item.nameSv,
})

const toPayload = (form: ResponsibilityAreaForm) => form

export default function ResponsibilityAreasClient() {
  useHelpContent(RESPONSIBILITY_AREAS_HELP)
  const t = useTranslations('responsibilityAreaMgmt')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()

  const getName = (item: ResponsibilityArea) =>
    locale === 'sv' ? item.nameSv : item.nameEn

  const controller = useCrudAdminResource<
    ResponsibilityArea,
    ResponsibilityAreaForm
  >({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/package-responsibility-areas',
    errorMessage: tc('error'),
    getInitialForm,
    listKey: 'areas',
    toForm,
    toPayload,
  })

  const columns: CrudAdminColumn<ResponsibilityArea>[] = [
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
      devContext="responsibility areas"
      renderFormFields={({ disabled, form, inputClassName, setForm }) => (
        <>
          <div>
            <FieldLabelWithHelp
              help={t('nameSvHelp')}
              htmlFor="ra-name-sv"
              label={t('nameSvLabel')}
              required
            />
            <input
              className={inputClassName}
              disabled={disabled}
              id="ra-name-sv"
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
              htmlFor="ra-name-en"
              label={t('nameEnLabel')}
              required
            />
            <input
              className={inputClassName}
              disabled={disabled}
              id="ra-name-en"
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
      title={tn('responsibilityAreas')}
    />
  )
}
