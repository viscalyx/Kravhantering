'use client'

import { useTranslations } from 'next-intl'
import CrudAdminPanel, {
  type CrudAdminColumn,
} from '@/components/CrudAdminPanel'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'

const OWNERS_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'owners.overview.body',
      headingKey: 'owners.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'owners.manage.body',
      headingKey: 'owners.manage.heading',
    },
  ],
  titleKey: 'owners.title',
}

interface Owner {
  email: string
  firstName: string
  id: number
  lastName: string
}

interface OwnerForm {
  email: string
  firstName: string
  lastName: string
}

const getInitialForm = (): OwnerForm => ({
  email: '',
  firstName: '',
  lastName: '',
})

const toForm = (item: Owner): OwnerForm => ({
  email: item.email,
  firstName: item.firstName,
  lastName: item.lastName,
})

const toPayload = (form: OwnerForm) => form

export default function OwnersClient() {
  useHelpContent(OWNERS_HELP)
  const t = useTranslations('ownerMgmt')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')

  const controller = useCrudAdminResource<Owner, OwnerForm>({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/owners',
    errorMessage: tc('error'),
    getInitialForm,
    listEndpoint: '/api/owners/all',
    listKey: 'owners',
    toForm,
    toPayload,
  })

  const columns: CrudAdminColumn<Owner>[] = [
    {
      className: 'py-3 px-4 font-medium',
      header: t('name'),
      key: 'name',
      render: item => `${item.firstName} ${item.lastName}`,
    },
    {
      className: 'py-3 px-4 text-secondary-600 dark:text-secondary-400',
      header: t('email'),
      key: 'email',
      render: item => item.email,
    },
  ]

  return (
    <CrudAdminPanel
      columns={columns}
      controller={controller}
      devContext="area owners"
      renderFormFields={({ disabled, form, inputClassName, setForm }) => (
        <fieldset className="space-y-5" disabled={disabled}>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="owner-first-name"
            >
              {t('firstName')} <span aria-hidden="true">*</span>
            </label>
            <input
              className={inputClassName}
              id="owner-first-name"
              onChange={event =>
                setForm(previousForm => ({
                  ...previousForm,
                  firstName: event.target.value,
                }))
              }
              required
              value={form.firstName}
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="owner-last-name"
            >
              {t('lastName')} <span aria-hidden="true">*</span>
            </label>
            <input
              className={inputClassName}
              id="owner-last-name"
              onChange={event =>
                setForm(previousForm => ({
                  ...previousForm,
                  lastName: event.target.value,
                }))
              }
              required
              value={form.lastName}
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="owner-email"
            >
              {t('email')} <span aria-hidden="true">*</span>
            </label>
            <input
              className={inputClassName}
              id="owner-email"
              onChange={event =>
                setForm(previousForm => ({
                  ...previousForm,
                  email: event.target.value,
                }))
              }
              required
              type="email"
              value={form.email}
            />
          </div>
        </fieldset>
      )}
      title={tn('areaOwners')}
    />
  )
}
