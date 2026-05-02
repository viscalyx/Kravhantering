'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import CrudAdminPanel, {
  type CrudAdminColumn,
} from '@/components/CrudAdminPanel'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'
import { apiFetch } from '@/lib/http/api-fetch'

const REQUIREMENT_AREAS_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'requirementAreas.overview.body',
      headingKey: 'requirementAreas.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementAreas.manage.body',
      headingKey: 'requirementAreas.manage.heading',
    },
  ],
  titleKey: 'requirementAreas.title',
}

interface Area {
  description: string | null
  id: number
  name: string
  ownerId: number | null
  ownerName: string | null
  prefix: string
}

interface AreaForm {
  description: string
  name: string
  ownerId: string
  prefix: string
}

interface OwnerOption {
  id: number
  name: string
}

const getInitialForm = (): AreaForm => ({
  description: '',
  name: '',
  ownerId: '',
  prefix: '',
})

const toForm = (area: Area): AreaForm => ({
  description: area.description ?? '',
  name: area.name,
  ownerId: area.ownerId != null ? String(area.ownerId) : '',
  prefix: area.prefix,
})

const toPayload = (form: AreaForm) => ({
  ...form,
  ownerId: form.ownerId ? Number(form.ownerId) : undefined,
})

export default function RequirementAreasClient() {
  useHelpContent(REQUIREMENT_AREAS_HELP)
  const t = useTranslations('area')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const [owners, setOwners] = useState<OwnerOption[]>([])

  useEffect(() => {
    let cancelled = false

    async function fetchOwners() {
      try {
        const response = await apiFetch('/api/owners')
        if (!response.ok || cancelled) return
        setOwners(
          ((await response.json()) as { owners?: OwnerOption[] }).owners ?? [],
        )
      } catch {
        if (!cancelled) setOwners([])
      }
    }

    void fetchOwners()

    return () => {
      cancelled = true
    }
  }, [])

  const controller = useCrudAdminResource<Area, AreaForm>({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/requirement-areas',
    errorMessage: tc('error'),
    getInitialForm,
    listKey: 'areas',
    toForm,
    toPayload,
  })

  const columns: CrudAdminColumn<Area>[] = [
    {
      className: 'py-3 px-4 font-mono font-medium',
      header: t('prefix'),
      key: 'prefix',
      render: area => area.prefix,
    },
    {
      header: t('name'),
      key: 'name',
      render: area => area.name,
    },
    {
      className:
        'py-3 px-4 text-secondary-600 dark:text-secondary-400 truncate max-w-xs',
      header: t('description'),
      key: 'description',
      render: area => area.description ?? '—',
    },
    {
      className: 'py-3 px-4 text-secondary-600 dark:text-secondary-400',
      header: t('owner'),
      key: 'owner',
      render: area => area.ownerName ?? '—',
    },
  ]

  return (
    <CrudAdminPanel
      columns={columns}
      controller={controller}
      devContext="areas"
      renderFormFields={({ disabled, form, inputClassName, setForm }) => (
        <>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="area-prefix"
            >
              {t('prefix')} *
            </label>
            <input
              className={inputClassName}
              disabled={disabled}
              id="area-prefix"
              maxLength={10}
              onChange={event =>
                setForm(previousForm => ({
                  ...previousForm,
                  prefix: event.target.value.toUpperCase(),
                }))
              }
              required
              value={form.prefix}
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="area-name"
            >
              {t('name')} *
            </label>
            <input
              className={inputClassName}
              disabled={disabled}
              id="area-name"
              onChange={event =>
                setForm(previousForm => ({
                  ...previousForm,
                  name: event.target.value,
                }))
              }
              required
              value={form.name}
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="area-desc"
            >
              {t('description')}
            </label>
            <textarea
              className={inputClassName}
              disabled={disabled}
              id="area-desc"
              onChange={event =>
                setForm(previousForm => ({
                  ...previousForm,
                  description: event.target.value,
                }))
              }
              value={form.description}
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="area-owner"
            >
              {t('owner')}
            </label>
            <select
              className={inputClassName}
              disabled={disabled}
              id="area-owner"
              onChange={event =>
                setForm(previousForm => ({
                  ...previousForm,
                  ownerId: event.target.value,
                }))
              }
              value={form.ownerId}
            >
              <option value="">{t('owner')}...</option>
              {owners.map(owner => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      title={tn('areas')}
    />
  )
}
