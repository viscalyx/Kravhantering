'use client'

import { AlertTriangle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import CrudAdminPanel, {
  type CrudAdminColumn,
} from '@/components/CrudAdminPanel'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import IconPicker from '@/components/IconPicker'
import StatusBadge from '@/components/StatusBadge'
import StatusBadgeThemePreview from '@/components/StatusBadgeThemePreview'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'
import { isStrictHexColor } from '@/lib/color-contrast'
import { devMarker } from '@/lib/developer-mode-markers'

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
  iconName: string | null
  id: number
  isSystem: boolean
  nameEn: string
  nameSv: string
  sortOrder: number
}

interface StatusForm {
  color: string
  iconName: string | null
  nameEn: string
  nameSv: string
  sortOrder: number
}

const getInitialForm = (): StatusForm => ({
  color: '#3b82f6',
  iconName: null,
  nameEn: '',
  nameSv: '',
  sortOrder: 0,
})

const toForm = (status: Status): StatusForm => ({
  color: status.color ?? '',
  iconName: status.iconName ?? null,
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
  const systemStatusController = {
    ...controller,
    items: controller.items.filter(status => status.isSystem),
  }
  const invalidStoredStatuses = systemStatusController.items.filter(
    status => !status.color || !isStrictHexColor(status.color),
  )

  const columns: CrudAdminColumn<Status>[] = [
    {
      className: 'py-3 px-4 font-medium',
      header: t('name'),
      key: 'name',
      render: status => (
        <StatusBadge
          color={status.color}
          iconName={status.iconName}
          label={getName(status)}
        />
      ),
    },
    {
      header: t('color'),
      key: 'color',
      render: status => (
        <span className="font-mono text-xs text-secondary-500 dark:text-secondary-400">
          {status.color}
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
      canCreate={false}
      canDelete={() => false}
      columns={columns}
      controller={systemStatusController}
      devContext="requirement version statuses"
      emptyStateMessage={t('emptyState')}
      formSubmitDisabled={!isStrictHexColor(controller.form.color)}
      notice={
        invalidStoredStatuses.length > 0 ? (
          <p
            className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
            {...devMarker({
              context: 'requirement version statuses',
              name: 'invalid color warning',
              priority: 350,
              value: invalidStoredStatuses.map(status => status.id).join(','),
            })}
            role="alert"
          >
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            {t('invalidStoredColors', {
              statuses: invalidStoredStatuses.map(getName).join(', '),
            })}
          </p>
        ) : null
      }
      renderFormFields={({ disabled, form, inputClassName, setForm }) => (
        <>
          <div>
            <FieldLabelWithHelp
              help={t('nameSvHelp')}
              htmlFor="status-name-sv"
              label={t('nameSvLabel')}
              required
            />
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
            <FieldLabelWithHelp
              help={t('nameEnHelp')}
              htmlFor="status-name-en"
              label={t('nameEnLabel')}
              required
            />
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
            <FieldLabelWithHelp
              help={t('sortOrderHelp')}
              htmlFor="status-sort-order"
              label={t('sortOrder')}
            />
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
            <FieldLabelWithHelp
              help={t('colorHelp')}
              htmlFor="status-color-hex"
              label={t('color')}
              required
            />
            <div className="flex items-center gap-3">
              {isStrictHexColor(form.color) && (
                <input
                  aria-label={t('colorPicker')}
                  className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border-2 border-secondary-400 dark:border-secondary-500"
                  data-color-swatch="exact-rgb"
                  disabled={disabled}
                  id="status-color-picker"
                  onChange={event =>
                    setForm(previousForm => ({
                      ...previousForm,
                      color: event.target.value,
                    }))
                  }
                  style={{ backgroundColor: form.color }}
                  type="color"
                  value={form.color}
                />
              )}
              <input
                aria-describedby={
                  isStrictHexColor(form.color)
                    ? undefined
                    : 'status-color-warning'
                }
                aria-invalid={!isStrictHexColor(form.color)}
                aria-label={t('colorHex')}
                className={`${inputClassName} min-w-0 max-w-36`}
                disabled={disabled}
                id="status-color-hex"
                onChange={event =>
                  setForm(previousForm => ({
                    ...previousForm,
                    color: event.target.value,
                  }))
                }
                pattern="^#[0-9a-fA-F]{6}$"
                placeholder="#3b82f6"
                required
                value={form.color}
              />
            </div>
          </div>
          <div>
            <FieldLabelWithHelp
              help={t('iconHelp')}
              htmlFor="status-icon"
              label={t('icon')}
            />
            <IconPicker
              disabled={disabled}
              id="status-icon"
              label={t('icon')}
              onChange={iconName =>
                setForm(previousForm => ({
                  ...previousForm,
                  iconName,
                }))
              }
              value={form.iconName}
            />
          </div>
          <StatusBadgeThemePreview
            color={form.color}
            copy={{
              contrastPassLabel: t('contrastPass'),
              contrastResultLabel: ratio => t('contrastResult', { ratio }),
              darkThemeLabel: t('darkTheme'),
              guidance: t('themePreviewGuidance'),
              invalidColorWarning: t('invalidColorWarning'),
              lightThemeLabel: t('lightTheme'),
              title: t('themePreview'),
            }}
            developerModeContext="requirement version statuses"
            iconName={form.iconName}
            label={locale === 'sv' ? form.nameSv : form.nameEn}
            warningId="status-color-warning"
          />
        </>
      )}
      title={tn('statuses')}
    />
  )
}
