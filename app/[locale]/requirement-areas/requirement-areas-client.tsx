'use client'

import { UserRoundCog } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import CrudAdminPanel, {
  type CrudAdminColumn,
} from '@/components/CrudAdminPanel'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import HsaPersonChangeModal, {
  type HsaPersonChangeSubmitResult,
} from '@/components/HsaPersonChangeModal'
import HsaPersonVerifyField, {
  type HsaPersonVerification,
} from '@/components/HsaPersonVerifyField'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'

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
  ownerPersonVerification: HsaPersonVerification | null
  prefix: string
}

interface OwnerChangeState {
  areaId: number
  currentOwnerHsaId: string
}

const getInitialForm = (): AreaForm => ({
  description: '',
  name: '',
  ownerHsaId: '',
  ownerPersonVerification: null,
  prefix: '',
})

const toForm = (area: Area): AreaForm => ({
  description: area.description ?? '',
  name: area.name,
  ownerHsaId: area.ownerHsaId,
  ownerPersonVerification: null,
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
    })
  }

  const closeOwnerChange = () => {
    setOwnerChange(null)
  }

  const submitOwnerChange = async (
    nextOwnerHsaId: string,
  ): Promise<HsaPersonChangeSubmitResult> => {
    if (!ownerChange) return { ok: false }
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
        return { error: message, ok: false }
      }
      controller.setForm(previousForm => ({
        ...previousForm,
        ownerHsaId: nextOwnerHsaId,
      }))
      setOwnerChange(null)
      await controller.reload()
      return { ok: true }
    } catch {
      return { error: t('ownerChangeError'), ok: false }
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
              <HsaPersonVerifyField
                disabled={disabled}
                emailLabel={tc('hsaVerifyEmail')}
                errorFallback={tc('hsaVerifyError')}
                fetchingLabel={tc('fetchingHsaPerson')}
                fetchLabel={tc('fetchHsaPerson')}
                hsaId={form.ownerHsaId}
                inputClassName={inputClassName}
                inputId="area-owner"
                nameLabel={tc('hsaVerifyName')}
                onHsaIdChange={value =>
                  setForm(previousForm => ({
                    ...previousForm,
                    ownerHsaId: value,
                    ownerPersonVerification:
                      value.trim() ===
                      previousForm.ownerPersonVerification?.hsaId
                        ? previousForm.ownerPersonVerification
                        : null,
                  }))
                }
                onVerified={person =>
                  setForm(previousForm => ({
                    ...previousForm,
                    ownerPersonVerification: person,
                  }))
                }
                purpose="requirement_area_owner"
                required
                unavailableText={tc('hsaVerifyUnavailable')}
              />
            )}
          </div>
        </>
      )}
      title={tn('areas')}
    >
      {ownerChange && (
        <HsaPersonChangeModal
          blockedError={t('ownerChangeCoAuthorConflict')}
          cancelLabel={tc('cancel')}
          currentHelp={t('help.currentOwner')}
          currentHsaId={ownerChange.currentOwnerHsaId}
          currentInputId="area-current-owner"
          currentLabel={t('currentOwner')}
          description={t('changeOwnerDescription')}
          developerModeValue="change requirement area owner"
          emailLabel={tc('hsaVerifyEmail')}
          errorFallback={tc('hsaVerifyError')}
          fetchingLabel={tc('fetchingHsaPerson')}
          fetchLabel={tc('fetchHsaPerson')}
          inputClassName={AREA_INPUT_CLASS_NAME}
          invalidError={t('ownerChangeInvalid')}
          nameLabel={tc('hsaVerifyName')}
          newHelp={t('help.newOwner')}
          newInputId="area-new-owner"
          newLabel={t('newOwner')}
          onClose={closeOwnerChange}
          onSubmit={submitOwnerChange}
          open
          purpose="requirement_area_owner"
          sameError={t('ownerChangeSame')}
          submitLabel={t('changeOwner')}
          submittingLabel={tc('saving')}
          title={t('changeOwnerTitle')}
          titleId="area-owner-change-title"
          unavailableText={tc('hsaVerifyUnavailable')}
        />
      )}
    </CrudAdminPanel>
  )
}
