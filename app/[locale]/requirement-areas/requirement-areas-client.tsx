'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { UserRoundCog, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import CrudAdminPanel, {
  type CrudAdminColumn,
} from '@/components/CrudAdminPanel'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'
import { HSA_ID_MAX_LENGTH, isHsaId } from '@/lib/auth/hsa-id'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'

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

const AREA_INPUT_CLASS_NAME =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

interface Area {
  description: string | null
  id: number
  name: string
  ownerHsaId: string
  prefix: string
}

interface AreaForm {
  description: string
  name: string
  ownerHsaId: string
  prefix: string
}

interface OwnerChangeState {
  areaId: number
  currentOwnerHsaId: string
  error: string | null
  nextOwnerHsaId: string
  submitting: boolean
}

const getInitialForm = (): AreaForm => ({
  description: '',
  name: '',
  ownerHsaId: '',
  prefix: '',
})

const toForm = (area: Area): AreaForm => ({
  description: area.description ?? '',
  name: area.name,
  ownerHsaId: area.ownerHsaId,
  prefix: area.prefix,
})

const toCreatePayload = (form: AreaForm) => ({
  description: form.description,
  name: form.name,
  ownerHsaId: form.ownerHsaId,
  prefix: form.prefix,
})

const toUpdatePayload = (form: AreaForm) => ({
  description: form.description,
  name: form.name,
})

export default function RequirementAreasClient() {
  useHelpContent(REQUIREMENT_AREAS_HELP)
  const t = useTranslations('area')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const shouldReduceMotion = useReducedMotion()
  const [ownerChange, setOwnerChange] = useState<OwnerChangeState | null>(null)

  const controller = useCrudAdminResource<Area, AreaForm>({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/requirement-areas',
    errorMessage: tc('error'),
    getInitialForm,
    listKey: 'areas',
    toCreatePayload,
    toForm,
    toPayload: toCreatePayload,
    toUpdatePayload,
  })

  const openOwnerChange = (areaId: number, currentOwnerHsaId: string) => {
    setOwnerChange({
      areaId,
      currentOwnerHsaId,
      error: null,
      nextOwnerHsaId: '',
      submitting: false,
    })
  }

  const closeOwnerChange = () => {
    setOwnerChange(current => (current?.submitting ? current : null))
  }

  const submitOwnerChange = async () => {
    if (!ownerChange || ownerChange.submitting) return
    const nextOwnerHsaId = ownerChange.nextOwnerHsaId.trim()
    if (!isHsaId(nextOwnerHsaId)) {
      setOwnerChange(current =>
        current ? { ...current, error: t('ownerChangeInvalid') } : current,
      )
      return
    }
    if (nextOwnerHsaId === ownerChange.currentOwnerHsaId) {
      setOwnerChange(current =>
        current ? { ...current, error: t('ownerChangeSame') } : current,
      )
      return
    }
    setOwnerChange(current =>
      current ? { ...current, error: null, submitting: true } : current,
    )
    try {
      const response = await apiFetch(
        `/api/requirement-areas/${ownerChange.areaId}`,
        {
          body: JSON.stringify({ ownerHsaId: nextOwnerHsaId }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT',
        },
      )
      if (!response.ok) {
        const message =
          (await readResponseMessage(response)) ?? t('ownerChangeError')
        setOwnerChange(current =>
          current
            ? {
                ...current,
                error: message,
                submitting: false,
              }
            : current,
        )
        return
      }
      controller.setForm(previousForm => ({
        ...previousForm,
        ownerHsaId: nextOwnerHsaId,
      }))
      setOwnerChange(null)
      await controller.reload()
    } catch {
      setOwnerChange(current =>
        current
          ? { ...current, error: t('ownerChangeError'), submitting: false }
          : current,
      )
    }
  }

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
      render: area => area.ownerHsaId,
    },
  ]

  return (
    <CrudAdminPanel
      columns={columns}
      controller={controller}
      devContext="areas"
      emptyStateMessage={t('emptyState')}
      renderFormFields={({
        disabled,
        editId,
        form,
        inputClassName,
        isEditing,
        setForm,
      }) => (
        <>
          <div>
            <FieldLabelWithHelp
              help={t('help.prefix')}
              htmlFor="area-prefix"
              label={t('prefix')}
              required
            />
            <input
              className={inputClassName}
              disabled={disabled || isEditing}
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
            <FieldLabelWithHelp
              help={t('help.name')}
              htmlFor="area-name"
              label={t('name')}
              required
            />
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
            <FieldLabelWithHelp
              help={t('help.description')}
              htmlFor="area-desc"
              label={t('description')}
            />
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
            <FieldLabelWithHelp
              help={t('help.owner')}
              htmlFor="area-owner"
              label={t('owner')}
              required
            />
            {isEditing ? (
              <div className="flex gap-2">
                <input
                  className={`${inputClassName} bg-secondary-100 text-secondary-500 dark:bg-secondary-800 dark:text-secondary-400`}
                  disabled
                  id="area-owner"
                  value={form.ownerHsaId}
                />
                <button
                  aria-label={t('changeOwner')}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border text-secondary-700 transition-colors hover:bg-secondary-50 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:text-secondary-300 dark:hover:bg-secondary-800"
                  disabled={disabled || editId == null}
                  onClick={() => {
                    if (typeof editId === 'number') {
                      openOwnerChange(editId, form.ownerHsaId)
                    }
                  }}
                  title={t('changeOwner')}
                  type="button"
                >
                  <UserRoundCog aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <input
                className={inputClassName}
                disabled={disabled}
                id="area-owner"
                maxLength={HSA_ID_MAX_LENGTH}
                onChange={event =>
                  setForm(previousForm => ({
                    ...previousForm,
                    ownerHsaId: event.target.value,
                  }))
                }
                required
                value={form.ownerHsaId}
              />
            )}
          </div>
        </>
      )}
      title={tn('areas')}
    >
      <AnimatePresence>
        {ownerChange && (
          <motion.div
            {...fadeMotion(shouldReduceMotion)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-secondary-950/60 px-4 py-6"
          >
            <motion.div
              {...dialogPanelMotion(shouldReduceMotion)}
              aria-modal="true"
              className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-xl dark:bg-secondary-900"
              role="dialog"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                    {t('changeOwnerTitle')}
                  </h2>
                  <p className="mt-1 text-sm text-secondary-600 dark:text-secondary-400">
                    {t('changeOwnerDescription')}
                  </p>
                </div>
                <button
                  aria-label={tc('cancel')}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-secondary-500 transition-colors hover:bg-secondary-100 focus-visible:ring-2 focus-visible:ring-primary-400/50 dark:hover:bg-secondary-800"
                  disabled={ownerChange.submitting}
                  onClick={closeOwnerChange}
                  type="button"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <FieldLabelWithHelp
                    help={t('help.currentOwner')}
                    htmlFor="area-current-owner"
                    label={t('currentOwner')}
                  />
                  <input
                    className={`${AREA_INPUT_CLASS_NAME} bg-secondary-100 text-secondary-500 dark:bg-secondary-800 dark:text-secondary-400`}
                    disabled
                    id="area-current-owner"
                    value={ownerChange.currentOwnerHsaId}
                  />
                </div>
                <div>
                  <FieldLabelWithHelp
                    help={t('help.newOwner')}
                    htmlFor="area-new-owner"
                    label={t('newOwner')}
                    required
                  />
                  <input
                    className={AREA_INPUT_CLASS_NAME}
                    disabled={ownerChange.submitting}
                    id="area-new-owner"
                    maxLength={HSA_ID_MAX_LENGTH}
                    onChange={event =>
                      setOwnerChange(current =>
                        current
                          ? {
                              ...current,
                              error: null,
                              nextOwnerHsaId: event.target.value,
                            }
                          : current,
                      )
                    }
                    value={ownerChange.nextOwnerHsaId}
                  />
                </div>
                {ownerChange.error && (
                  <p
                    className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
                    role="alert"
                  >
                    {ownerChange.error}
                  </p>
                )}
                <div className="flex justify-end gap-3">
                  <button
                    className="rounded-xl border px-4 py-2.5 text-sm text-secondary-700 transition-colors hover:bg-secondary-50 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:opacity-60 dark:text-secondary-300 dark:hover:bg-secondary-800"
                    disabled={ownerChange.submitting}
                    onClick={closeOwnerChange}
                    type="button"
                  >
                    {tc('cancel')}
                  </button>
                  <button
                    className="btn-primary"
                    disabled={
                      ownerChange.submitting ||
                      !isHsaId(ownerChange.nextOwnerHsaId.trim()) ||
                      ownerChange.nextOwnerHsaId.trim() ===
                        ownerChange.currentOwnerHsaId
                    }
                    onClick={submitOwnerChange}
                    type="button"
                  >
                    {ownerChange.submitting ? tc('saving') : t('changeOwner')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </CrudAdminPanel>
  )
}
