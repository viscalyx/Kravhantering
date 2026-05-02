'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useCallback } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import CrudAdminPanel, {
  type CrudAdminColumn,
} from '@/components/CrudAdminPanel'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import StatusBadge from '@/components/StatusBadge'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'

const REQUIREMENT_STATUSES_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'requirementStatuses.overview.body',
      headingKey: 'requirementStatuses.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementStatuses.manage.body',
      headingKey: 'requirementStatuses.manage.heading',
    },
  ],
  titleKey: 'requirementStatuses.title',
}

interface Status {
  color: string | null
  id: number
  isSystem: boolean
  nameEn: string
  nameSv: string
  sortOrder: number
}

interface StatusForm {
  color: string
  nameEn: string
  nameSv: string
  sortOrder: number
}

const getInitialForm = (): StatusForm => ({
  color: '#3b82f6',
  nameEn: '',
  nameSv: '',
  sortOrder: 0,
})

const toForm = (status: Status): StatusForm => ({
  color: status.color ?? '#3b82f6',
  nameEn: status.nameEn,
  nameSv: status.nameSv,
  sortOrder: status.sortOrder,
})

const toPayload = (form: StatusForm) => form

export default function RequirementStatusesClient() {
  useHelpContent(REQUIREMENT_STATUSES_HELP)
  const t = useTranslations('statusMgmt')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const errorFallback = tc('error')

  const getName = (status: Status) =>
    locale === 'sv' ? status.nameSv : status.nameEn

  const presentMutationError = useCallback(
    async ({
      anchorEl,
      message,
    }: {
      anchorEl?: HTMLElement
      message: string
    }) => {
      await confirm({
        anchorEl,
        icon: 'warning',
        message: message || errorFallback,
        showCancel: false,
      })
    },
    [confirm, errorFallback],
  )

  const getCaughtErrorMessage = useCallback(
    (error: unknown) =>
      error instanceof Error ? error.message || errorFallback : errorFallback,
    [errorFallback],
  )

  const controller = useCrudAdminResource<Status, StatusForm>({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/requirement-statuses',
    errorMessage: errorFallback,
    getCaughtErrorMessage,
    getInitialForm,
    listKey: 'statuses',
    onDeleteError: presentMutationError,
    onSubmitError: presentMutationError,
    reloadOnDeleteError: true,
    toForm,
    toPayload,
  })

  const columns: CrudAdminColumn<Status>[] = [
    {
      className: 'py-3 px-4 font-medium',
      header: t('name'),
      key: 'name',
      render: status => (
        <StatusBadge color={status.color} label={getName(status)} />
      ),
    },
    {
      header: t('color'),
      key: 'color',
      render: status => (
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 rounded-full border"
            style={{ backgroundColor: status.color ?? '#ccc' }}
          />
          <span className="font-mono text-xs text-secondary-500">
            {status.color}
          </span>
        </span>
      ),
    },
    {
      header: t('sortOrder'),
      key: 'sortOrder',
      render: status => status.sortOrder,
    },
    {
      header: t('isSystem'),
      key: 'isSystem',
      render: status => (status.isSystem ? tc('yes') : tc('no')),
    },
  ]

  return (
    <CrudAdminPanel
      canDelete={status => !status.isSystem}
      columns={columns}
      controller={controller}
      devContext="statuses"
      renderFormFields={({ disabled, form, inputClassName, setForm }) => (
        <>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="status-name-sv"
            >
              {t('name')} (SV) <span aria-hidden="true">*</span>
            </label>
            <input
              className={inputClassName}
              disabled={disabled}
              id="status-name-sv"
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
              htmlFor="status-name-en"
            >
              {t('name')} (EN) <span aria-hidden="true">*</span>
            </label>
            <input
              className={inputClassName}
              disabled={disabled}
              id="status-name-en"
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
          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="status-sort-order"
            >
              {t('sortOrder')}
            </label>
            <input
              className={inputClassName}
              disabled={disabled}
              id="status-sort-order"
              min={0}
              onChange={event =>
                setForm(previousForm => ({
                  ...previousForm,
                  sortOrder: Number(event.target.value),
                }))
              }
              type="number"
              value={form.sortOrder}
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="status-color"
            >
              {t('color')}
            </label>
            <div className="flex items-center gap-3">
              <input
                className="h-10 w-10 rounded-lg border-0 cursor-pointer"
                disabled={disabled}
                id="status-color"
                onChange={event =>
                  setForm(previousForm => ({
                    ...previousForm,
                    color: event.target.value,
                  }))
                }
                type="color"
                value={form.color}
              />
              <span className="text-sm font-mono text-secondary-500">
                {form.color}
              </span>
              <StatusBadge
                color={form.color}
                label={form.nameSv || t('preview')}
              />
            </div>
          </div>
        </>
      )}
      title={tn('statuses')}
    />
  )
}
