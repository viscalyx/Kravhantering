'use client'

import {
  Archive,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useDeferredValue, useRef, useState } from 'react'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FloatingActionRail from '@/components/FloatingActionRail'
import FormModal from '@/components/FormModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import HsaPersonVerifyField, {
  type HsaPersonVerification,
} from '@/components/HsaPersonVerifyField'
import StatusBadge from '@/components/StatusBadge'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'
import { Link } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { isSwedish } from '@/lib/i18n/localized'
import { resolveStatusLabel } from '@/lib/requirements/status-label'

const REQUIREMENT_PACKAGES_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'requirementPackages.overview.body',
      headingKey: 'requirementPackages.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementPackages.manage.body',
      headingKey: 'requirementPackages.manage.heading',
    },
  ],
  titleKey: 'requirementPackages.title',
}

interface RequirementPackage {
  coAuthors: RequirementPackageCoAuthor[]
  description: string | null
  id: number
  isArchived: boolean
  leadDisplayName: string
  leadEmail: string | null
  leadHsaId: string
  linkedRequirementCount: number
  name: string
}

interface RequirementPackageCoAuthor {
  displayName: string
  email: string | null
  hsaId: string
}

interface RequirementPackageCoAuthorForm {
  displayName: string
  email: string
  hsaId: string
  personVerification: HsaPersonVerification | null
}

interface RequirementPackageForm {
  coAuthors: RequirementPackageCoAuthorForm[]
  description: string
  leadDisplayName: string
  leadEmail: string
  leadHsaId: string
  leadPersonVerification: HsaPersonVerification | null
  name: string
}

interface LinkedRequirement {
  archiveInitiatedAt: string | null
  description: string | null
  id: number
  statusColor: string | null
  statusIconName: string | null
  statusId: number | null
  statusNameEn: string | null
  statusNameSv: string | null
  uniqueId: string
  versionNumber: number
}

const DESCRIPTION_TRUNCATE = 80
const REQUIREMENT_PACKAGE_TABLE_COLUMN_COUNT = 6

const getInitialForm = (): RequirementPackageForm => ({
  coAuthors: [],
  description: '',
  leadDisplayName: '',
  leadEmail: '',
  leadHsaId: '',
  leadPersonVerification: null,
  name: '',
})

const toForm = (
  requirementPackage: RequirementPackage,
): RequirementPackageForm => ({
  coAuthors: (requirementPackage.coAuthors ?? []).map(coAuthor => ({
    displayName: coAuthor.displayName,
    email: coAuthor.email ?? '',
    hsaId: coAuthor.hsaId,
    personVerification: null,
  })),
  description: requirementPackage.description ?? '',
  leadDisplayName: requirementPackage.leadDisplayName,
  leadEmail: requirementPackage.leadEmail ?? '',
  leadHsaId: requirementPackage.leadHsaId,
  leadPersonVerification: null,
  name: requirementPackage.name,
})

const coAuthorHsaIdsFromForm = (form: RequirementPackageForm) =>
  form.coAuthors.map(coAuthor => coAuthor.hsaId.trim()).filter(Boolean)

const toCreatePayload = (form: RequirementPackageForm) => ({
  coAuthorHsaIds: coAuthorHsaIdsFromForm(form),
  description: form.description || undefined,
  name: form.name,
})

const toUpdatePayload = (form: RequirementPackageForm) => ({
  coAuthorHsaIds: coAuthorHsaIdsFromForm(form),
  description: form.description || undefined,
  leadHsaId: form.leadHsaId,
  name: form.name,
})

const toPayload = toUpdatePayload

const inputClassName =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

const rowActionButtonClassName =
  'inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'

export default function RequirementPackagesClient() {
  useHelpContent(REQUIREMENT_PACKAGES_HELP)
  const t = useTranslations('requirementPackage')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const tr = useTranslations('requirement')
  const tStatusLabel = useTranslations('requirement.statusLabel')
  const locale = useLocale()
  const contentRef = useRef<HTMLDivElement>(null)
  const tableAnchorRef = useRef<HTMLDivElement>(null)
  const nameFilterRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [nameFilter, setNameFilter] = useState('')
  const [stateError, setStateError] = useState<string | null>(null)
  const [stateChangingIds, setStateChangingIds] = useState<Set<number>>(
    new Set(),
  )
  const [linkedRequirements, setLinkedRequirements] = useState<
    LinkedRequirement[]
  >([])
  const [linkedRequirementsError, setLinkedRequirementsError] = useState<
    string | null
  >(null)
  const [linkedRequirementsLoading, setLinkedRequirementsLoading] =
    useState(false)
  const linkedReqRequestId = useRef(0)

  const controller = useCrudAdminResource<
    RequirementPackage,
    RequirementPackageForm
  >({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/requirement-packages',
    errorMessage: tc('error'),
    getInitialForm,
    listEndpoint: '/api/requirement-packages?includeArchived=true',
    listKey: 'requirementPackages',
    toCreatePayload,
    toForm,
    toPayload,
    toUpdatePayload,
  })

  const fetchLinkedRequirements = useCallback(
    async (requirementPackageId: number) => {
      const requestId = ++linkedReqRequestId.current
      setLinkedRequirementsLoading(true)
      setLinkedRequirementsError(null)
      try {
        const response = await apiFetch(
          `/api/requirement-packages/${requirementPackageId}`,
        )
        if (requestId !== linkedReqRequestId.current) return
        if (!response.ok) {
          setLinkedRequirements([])
          setLinkedRequirementsError(tc('error'))
          return
        }
        const data = (await response.json()) as {
          linkedRequirements?: LinkedRequirement[]
        }
        if (requestId !== linkedReqRequestId.current) return
        setLinkedRequirements(data.linkedRequirements ?? [])
      } catch {
        if (requestId === linkedReqRequestId.current) {
          setLinkedRequirements([])
          setLinkedRequirementsError(tc('error'))
        }
      } finally {
        if (requestId === linkedReqRequestId.current) {
          setLinkedRequirementsLoading(false)
        }
      }
    },
    [tc],
  )

  const openCreate = () => {
    linkedReqRequestId.current++
    setLinkedRequirements([])
    setLinkedRequirementsError(null)
    setLinkedRequirementsLoading(false)
    setStateError(null)
    controller.openCreate()
  }

  const openEdit = (requirementPackage: RequirementPackage) => {
    setStateError(null)
    controller.openEdit(requirementPackage)
    void fetchLinkedRequirements(requirementPackage.id)
  }

  const closeForm = () => {
    linkedReqRequestId.current++
    setLinkedRequirements([])
    setLinkedRequirementsError(null)
    setLinkedRequirementsLoading(false)
    controller.closeForm()
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    const didSubmit = await controller.submit(event)
    if (didSubmit) {
      linkedReqRequestId.current++
      setLinkedRequirements([])
      setLinkedRequirementsError(null)
      setLinkedRequirementsLoading(false)
    }
  }

  const remove = async (id: number, anchorEl?: HTMLElement) => {
    const didRemove = await controller.remove(id, anchorEl)
    if (didRemove && controller.editId === id) {
      setLinkedRequirements([])
      setLinkedRequirementsError(null)
    }
  }

  const changeArchivedState = async (
    requirementPackage: RequirementPackage,
    operation: 'archive' | 'reactivate',
  ) => {
    setStateError(null)
    setStateChangingIds(previous =>
      new Set(previous).add(requirementPackage.id),
    )
    try {
      const response = await apiFetch(
        `/api/requirement-packages/${requirementPackage.id}/${operation}`,
        { method: 'POST' },
      )
      if (!response.ok) {
        setStateError((await readResponseMessage(response)) ?? tc('error'))
        return
      }
      await controller.reload()
    } catch {
      setStateError(tc('error'))
    } finally {
      setStateChangingIds(previous => {
        const next = new Set(previous)
        next.delete(requirementPackage.id)
        return next
      })
    }
  }

  const truncateDescription = (text: string | null) => {
    if (!text) return null
    if (text.length <= DESCRIPTION_TRUNCATE) return text
    return `${text.slice(0, DESCRIPTION_TRUNCATE)}...`
  }

  const isBusy = (requirementPackage: RequirementPackage) =>
    controller.submitting ||
    controller.deletingIds.has(requirementPackage.id) ||
    stateChangingIds.has(requirementPackage.id)
  const addCoAuthor = () => {
    controller.setForm(previousForm => ({
      ...previousForm,
      coAuthors: [
        ...previousForm.coAuthors,
        { displayName: '', email: '', hsaId: '', personVerification: null },
      ],
    }))
  }
  const removeCoAuthor = (index: number) => {
    controller.setForm(previousForm => ({
      ...previousForm,
      coAuthors: previousForm.coAuthors.filter(
        (_, rowIndex) => rowIndex !== index,
      ),
    }))
  }
  const updateCoAuthor = (
    index: number,
    values: Partial<RequirementPackageCoAuthorForm>,
  ) => {
    controller.setForm(previousForm => ({
      ...previousForm,
      coAuthors: previousForm.coAuthors.map((coAuthor, rowIndex) =>
        rowIndex === index ? { ...coAuthor, ...values } : coAuthor,
      ),
    }))
  }
  const deferredNameFilter = useDeferredValue(nameFilter)
  const normalizedNameFilter = deferredNameFilter
    .trim()
    .toLocaleLowerCase(locale)
  const hasActiveNameFilter = nameFilter.trim().length > 0
  const filteredRequirementPackages = controller.items.filter(
    requirementPackage => {
      const searchableText = [
        requirementPackage.name,
        requirementPackage.description ?? '',
      ]
        .join(' ')
        .toLocaleLowerCase(locale)

      return searchableText.includes(normalizedNameFilter)
    },
  )

  const renderPackageFormFields = () => (
    <>
      <div>
        <FieldLabelWithHelp
          help={t('nameHelp')}
          htmlFor="requirement-package-name"
          label={t('name')}
          required
        />
        <input
          className={inputClassName}
          disabled={controller.submitting}
          id="requirement-package-name"
          onChange={event =>
            controller.setForm(previousForm => ({
              ...previousForm,
              name: event.target.value,
            }))
          }
          ref={nameInputRef}
          required
          value={controller.form.name}
        />
      </div>
      <div>
        <FieldLabelWithHelp
          help={t('descriptionHelp')}
          htmlFor="requirement-package-description"
          label={t('description')}
        />
        <textarea
          className={inputClassName}
          disabled={controller.submitting}
          id="requirement-package-description"
          onChange={event =>
            controller.setForm(previousForm => ({
              ...previousForm,
              description: event.target.value,
            }))
          }
          value={controller.form.description}
        />
      </div>
      {controller.editId != null && (
        <div>
          <FieldLabelWithHelp
            help={t('leadHsaIdHelp')}
            htmlFor="requirement-package-lead-hsa-id"
            label={t('leadHsaId')}
            required
          />
          <HsaPersonVerifyField
            disabled={controller.submitting}
            emailLabel={tc('hsaVerifyEmail')}
            errorFallback={tc('hsaVerifyError')}
            fetchingLabel={tc('fetchingHsaPerson')}
            fetchLabel={tc('fetchHsaPerson')}
            hsaId={controller.form.leadHsaId}
            initialDisplayName={controller.form.leadDisplayName}
            initialEmail={controller.form.leadEmail}
            inputClassName={inputClassName}
            inputId="requirement-package-lead-hsa-id"
            nameLabel={tc('hsaVerifyName')}
            onHsaIdChange={value =>
              controller.setForm(previousForm => ({
                ...previousForm,
                leadHsaId: value,
                leadDisplayName:
                  value.trim() === previousForm.leadHsaId.trim()
                    ? previousForm.leadDisplayName
                    : '',
                leadEmail:
                  value.trim() === previousForm.leadHsaId.trim()
                    ? previousForm.leadEmail
                    : '',
                leadPersonVerification:
                  value.trim() === previousForm.leadPersonVerification?.hsaId
                    ? previousForm.leadPersonVerification
                    : null,
              }))
            }
            onVerified={person =>
              controller.setForm(previousForm => ({
                ...previousForm,
                leadDisplayName: person.displayName,
                leadEmail: person.email ?? '',
                leadPersonVerification: person,
              }))
            }
            purpose="requirement_package_lead"
            required
            scopeId={controller.editId}
            showPersonSummaryAsText
            unavailableText={tc('hsaVerifyUnavailable')}
          />
        </div>
      )}
    </>
  )

  const renderCoAuthorsSection = () => (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
            {t('coAuthors')}
          </h3>
          <p className="mt-1 text-sm text-secondary-500 dark:text-secondary-400">
            {t('coAuthorsHelp')}
          </p>
        </div>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3.5 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:text-secondary-200 dark:hover:bg-secondary-800"
          disabled={controller.submitting}
          onClick={addCoAuthor}
          type="button"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {t('addCoAuthor')}
        </button>
      </div>
      {controller.form.coAuthors.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-secondary-500 dark:text-secondary-400">
          {t('noCoAuthors')}
        </p>
      ) : (
        <div className="space-y-3">
          {controller.form.coAuthors.map((coAuthor, index) => {
            const inputId = `requirement-package-co-author-${index}`
            return (
              <div className="rounded-xl border p-3" key={inputId}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <FieldLabelWithHelp
                      help={t('coAuthorHsaIdHelp')}
                      htmlFor={inputId}
                      label={t('coAuthorHsaId')}
                      required
                    />
                    <HsaPersonVerifyField
                      disabled={controller.submitting}
                      emailLabel={tc('hsaVerifyEmail')}
                      errorFallback={tc('hsaVerifyError')}
                      fetchingLabel={tc('fetchingHsaPerson')}
                      fetchLabel={tc('fetchHsaPerson')}
                      hsaId={coAuthor.hsaId}
                      initialDisplayName={coAuthor.displayName}
                      initialEmail={coAuthor.email}
                      inputClassName={inputClassName}
                      inputId={inputId}
                      nameLabel={tc('hsaVerifyName')}
                      onHsaIdChange={value =>
                        updateCoAuthor(index, {
                          displayName:
                            value.trim() === coAuthor.hsaId.trim()
                              ? coAuthor.displayName
                              : '',
                          email:
                            value.trim() === coAuthor.hsaId.trim()
                              ? coAuthor.email
                              : '',
                          hsaId: value,
                          personVerification:
                            value.trim() === coAuthor.personVerification?.hsaId
                              ? coAuthor.personVerification
                              : null,
                        })
                      }
                      onVerified={person =>
                        updateCoAuthor(index, {
                          displayName: person.displayName,
                          email: person.email ?? '',
                          personVerification: person,
                        })
                      }
                      purpose="requirement_package_co_author"
                      required
                      showPersonSummaryAsText
                      scopeId={controller.editId ?? undefined}
                      unavailableText={tc('hsaVerifyUnavailable')}
                    />
                  </div>
                  <button
                    aria-label={t('removeCoAuthor')}
                    className={`${rowActionButtonClassName} mt-7 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30`}
                    disabled={controller.submitting}
                    onClick={() => removeCoAuthor(index)}
                    title={t('removeCoAuthor')}
                    type="button"
                  >
                    <Trash2
                      aria-hidden="true"
                      className="h-4 w-4"
                      focusable={false}
                    />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const renderPackageForm = () => (
    <form
      className="space-y-5"
      {...devMarker({
        context: 'requirementPackages',
        name: 'crud form',
        priority: 340,
        value: controller.editId ? 'edit' : 'create',
      })}
      onSubmit={submit}
    >
      {renderPackageFormFields()}
      {renderCoAuthorsSection()}
      {controller.formError && (
        <p
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {controller.formError}
        </p>
      )}
      <div className="flex gap-3">
        <button
          className="btn-primary"
          disabled={controller.submitting}
          type="submit"
        >
          {controller.submitting ? tc('saving') : tc('save')}
        </button>
        <button
          className="min-h-11 min-w-11 rounded-xl border px-4 py-2.5 text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2"
          disabled={controller.submitting}
          onClick={closeForm}
          type="button"
        >
          {tc('cancel')}
        </button>
      </div>
    </form>
  )

  const renderEditPackageForm = () => (
    <form
      className="space-y-6"
      {...devMarker({
        context: 'requirementPackages',
        name: 'crud form',
        priority: 340,
        value: 'edit',
      })}
      onSubmit={submit}
    >
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-5">
          {renderPackageFormFields()}
          {controller.formError && (
            <p
              className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
              role="alert"
            >
              {controller.formError}
            </p>
          )}
        </div>
        {renderCoAuthorsSection()}
      </div>
      <div className="flex gap-3">
        <button
          className="btn-primary"
          disabled={controller.submitting}
          type="submit"
        >
          {controller.submitting ? tc('saving') : tc('save')}
        </button>
        <button
          className="min-h-11 min-w-11 rounded-xl border px-4 py-2.5 text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2"
          disabled={controller.submitting}
          onClick={closeForm}
          type="button"
        >
          {tc('cancel')}
        </button>
      </div>
      <div>
        <div className="h-px border-t-2 border-dashed border-secondary-200 dark:border-secondary-700" />
      </div>
      {renderLinkedRequirements()}
    </form>
  )

  const renderLinkedRequirements = () => (
    <div>
      <h3 className="mb-3 text-sm font-medium text-secondary-600 dark:text-secondary-400">
        {t('linkedRequirements')}
      </h3>
      {linkedRequirementsLoading ? (
        <p
          className="text-sm text-secondary-500 dark:text-secondary-400"
          role="status"
        >
          {tc('loading')}
        </p>
      ) : linkedRequirementsError ? (
        <p
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {linkedRequirementsError}
        </p>
      ) : linkedRequirements.length === 0 ? (
        <p className="text-sm text-secondary-500 dark:text-secondary-400">
          {tc('noneAvailable')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary-50/80 text-left text-secondary-700 dark:bg-secondary-800/30 dark:text-secondary-300">
                <th className="px-3 py-2 font-medium">{tr('uniqueId')}</th>
                <th className="px-3 py-2 font-medium">{tr('description')}</th>
                <th className="px-3 py-2 font-medium">{tc('version')}</th>
                <th className="px-3 py-2 font-medium">{tr('status')}</th>
              </tr>
            </thead>
            <tbody>
              {linkedRequirements.map(requirement => {
                const truncated = truncateDescription(requirement.description)
                const isTruncated =
                  truncated !== requirement.description &&
                  requirement.description != null
                return (
                  <tr
                    className="border-b transition-colors last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-950/20"
                    key={`${requirement.id}-v${requirement.versionNumber}`}
                  >
                    <td className="px-3 py-2 font-medium">
                      <Link
                        className="inline-flex min-h-11 min-w-11 items-center text-primary-700 hover:underline dark:text-primary-300"
                        href={`/requirements/${requirement.uniqueId}/${requirement.versionNumber}`}
                      >
                        {requirement.uniqueId}
                      </Link>
                    </td>
                    <td
                      className="max-w-xs px-3 py-2 text-secondary-600 dark:text-secondary-400"
                      title={
                        isTruncated
                          ? (requirement.description ?? undefined)
                          : undefined
                      }
                    >
                      {truncated ?? '-'}
                    </td>
                    <td className="px-3 py-2 text-secondary-600 dark:text-secondary-400">
                      v{requirement.versionNumber}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge
                        color={requirement.statusColor}
                        iconName={requirement.statusIconName}
                        label={resolveStatusLabel(
                          {
                            archiveInitiatedAt: requirement.archiveInitiatedAt,
                            status: requirement.statusId,
                            statusNameEn: requirement.statusNameEn,
                            statusNameSv: requirement.statusNameSv,
                          },
                          isSwedish(locale) ? 'sv' : 'en',
                          tStatusLabel,
                        )}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  const isEditing = controller.showForm && controller.editId != null
  const formModalTitle = isEditing
    ? t('editRequirementPackage')
    : t('newRequirementPackage')

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom" ref={contentRef}>
        <FloatingActionRail
          anchorRef={tableAnchorRef}
          developerModeContext="requirementPackages"
          items={[
            {
              ariaLabel: t('newRequirementPackage'),
              developerModeValue: 'new requirement package',
              disabled: controller.submitting,
              icon: <Plus aria-hidden="true" className="h-4 w-4" />,
              id: 'create',
              onClick: openCreate,
              variant: 'primary',
            },
          ]}
        />
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('requirementPackages')}
          </h1>
        </div>

        <div className="mb-4">
          {!controller.loading && controller.items.length > 0 && (
            <div className="w-full max-w-lg">
              <label
                className="mb-1.5 block text-sm font-medium text-secondary-700 dark:text-secondary-300"
                htmlFor="requirement-package-name-filter"
              >
                {t('filterByName')}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400"
                  />
                  <input
                    autoComplete="off"
                    className="min-h-11 w-full rounded-xl border border-secondary-200 bg-white py-2.5 pr-3 pl-10 text-sm text-secondary-900 transition-all duration-200 placeholder:text-secondary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-100 dark:placeholder:text-secondary-500"
                    {...devMarker({
                      context: 'requirementPackages',
                      name: 'text field',
                      priority: 330,
                      value: 'name or description filter',
                    })}
                    id="requirement-package-name-filter"
                    onChange={event => setNameFilter(event.target.value)}
                    placeholder={t('filterByNamePlaceholder')}
                    ref={nameFilterRef}
                    type="text"
                    value={nameFilter}
                  />
                </div>
                {hasActiveNameFilter && (
                  <button
                    className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border border-secondary-200 px-4 py-2.5 text-sm text-secondary-700 transition-all duration-200 hover:bg-secondary-50 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800/60"
                    onClick={() => setNameFilter('')}
                    type="button"
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                    {tc('clearSearch')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {(controller.deleteError || controller.loadError || stateError) && (
          <p
            className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
            {...devMarker({
              context: 'requirementPackages',
              name: 'error banner',
              priority: 340,
              value: controller.deleteError
                ? 'delete-error'
                : stateError
                  ? 'state-error'
                  : 'load-error',
            })}
            role="alert"
          >
            {controller.deleteError ?? controller.loadError ?? stateError}
          </p>
        )}

        <FormModal
          closeDisabled={controller.submitting}
          developerModeValue={
            isEditing ? 'edit requirement package' : 'new requirement package'
          }
          initialFocusRef={nameInputRef}
          maxWidthClassName={isEditing ? 'max-w-5xl' : undefined}
          onClose={closeForm}
          open={controller.showForm}
          title={formModalTitle}
          titleId={
            isEditing
              ? 'requirement-package-edit-title'
              : 'requirement-package-create-title'
          }
        >
          {isEditing ? (
            renderEditPackageForm()
          ) : (
            renderPackageForm()
          )}
        </FormModal>

        {controller.loading ? (
          <p
            className="text-secondary-600 dark:text-secondary-400"
            role="status"
          >
            {tc('loading')}
          </p>
        ) : (
          <div
            className="overflow-x-auto rounded-2xl border bg-white/80 shadow-sm backdrop-blur-sm dark:bg-secondary-900/60"
            {...devMarker({
              context: 'requirementPackages',
              name: 'crud table',
              priority: 340,
            })}
            ref={tableAnchorRef}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary-50/80 text-left text-secondary-700 dark:bg-secondary-800/30 dark:text-secondary-300">
                  <th className="px-4 py-3 font-medium">{t('name')}</th>
                  <th className="px-4 py-3 font-medium">{t('description')}</th>
                  <th className="px-4 py-3 font-medium">{t('lead')}</th>
                  <th className="px-4 py-3 font-medium">{t('status')}</th>
                  <th className="px-4 py-3 text-center font-medium">
                    {t('linkedRequirements')}
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {controller.items.length === 0 ? (
                  <tr
                    {...devMarker({
                      context: 'requirementPackages',
                      name: 'empty state',
                      priority: 330,
                    })}
                  >
                    <td
                      className="px-4 py-10 text-center"
                      colSpan={REQUIREMENT_PACKAGE_TABLE_COLUMN_COUNT}
                    >
                      <div className="flex flex-col items-center justify-center gap-3 text-secondary-500 dark:text-secondary-400">
                        <p>{t('emptyState')}</p>
                        <button
                          className="btn-primary inline-flex items-center gap-1.5"
                          {...devMarker({
                            context: 'requirementPackages',
                            name: 'empty state create button',
                            priority: 330,
                          })}
                          disabled={controller.submitting}
                          onClick={openCreate}
                          type="button"
                        >
                          <Plus aria-hidden="true" className="h-4 w-4" />
                          {tc('create')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : filteredRequirementPackages.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-10 text-center text-secondary-500 dark:text-secondary-400"
                      colSpan={REQUIREMENT_PACKAGE_TABLE_COLUMN_COUNT}
                    >
                      {tc('noResults')}
                    </td>
                  </tr>
                ) : (
                  filteredRequirementPackages.map(requirementPackage => {
                    const archiveActionLabel = requirementPackage.isArchived
                      ? t('reactivate')
                      : t('archive')
                    const archiveActionValue = requirementPackage.isArchived
                      ? 'reactivate'
                      : 'archive'
                    const busy = isBusy(requirementPackage)

                    return (
                      <tr
                        className="border-b transition-colors hover:bg-primary-50/40 dark:hover:bg-primary-950/20"
                        key={requirementPackage.id}
                      >
                        <td className="px-4 py-3 font-medium">
                          {requirementPackage.name}
                        </td>
                        <td
                          className="w-[28rem] max-w-[28rem] whitespace-normal break-words px-4 py-3 align-top leading-6 text-secondary-600 dark:text-secondary-400"
                          title={requirementPackage.description || '-'}
                        >
                          {requirementPackage.description || '-'}
                        </td>
                        <td className="px-4 py-3 text-secondary-600 dark:text-secondary-400">
                          <span className="block">
                            {requirementPackage.leadDisplayName}
                          </span>
                          <span className="block text-xs text-secondary-500 dark:text-secondary-500">
                            {requirementPackage.leadHsaId}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-secondary-600 dark:text-secondary-400">
                          {requirementPackage.isArchived
                            ? t('archived')
                            : t('active')}
                        </td>
                        <td className="px-4 py-3 text-center text-secondary-600 dark:text-secondary-400">
                          {t('requirementCount', {
                            count: requirementPackage.linkedRequirementCount,
                          })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              aria-label={tc('edit')}
                              className={`${rowActionButtonClassName} text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-950/30`}
                              {...devMarker({
                                context: 'requirementPackages',
                                name: 'table action',
                                value: 'edit',
                              })}
                              disabled={busy}
                              onClick={() => openEdit(requirementPackage)}
                              title={tc('edit')}
                              type="button"
                            >
                              <Pencil
                                aria-hidden="true"
                                className="h-4 w-4"
                                focusable={false}
                              />
                            </button>
                            <button
                              aria-label={archiveActionLabel}
                              className={`${rowActionButtonClassName} text-secondary-700 hover:bg-secondary-100 dark:text-secondary-300 dark:hover:bg-secondary-800/70`}
                              {...devMarker({
                                context: 'requirementPackages',
                                name: 'table action',
                                value: archiveActionValue,
                              })}
                              disabled={busy}
                              onClick={() => {
                                void changeArchivedState(
                                  requirementPackage,
                                  requirementPackage.isArchived
                                    ? 'reactivate'
                                    : 'archive',
                                )
                              }}
                              title={archiveActionLabel}
                              type="button"
                            >
                              {requirementPackage.isArchived ? (
                                <RotateCcw
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                  focusable={false}
                                />
                              ) : (
                                <Archive
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                  focusable={false}
                                />
                              )}
                            </button>
                            <button
                              aria-label={tc('delete')}
                              className={`${rowActionButtonClassName} text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30`}
                              {...devMarker({
                                context: 'requirementPackages',
                                name: 'table action',
                                value: 'delete',
                              })}
                              disabled={busy}
                              onClick={event => {
                                void remove(
                                  requirementPackage.id,
                                  event.currentTarget,
                                )
                              }}
                              title={tc('delete')}
                              type="button"
                            >
                              <Trash2
                                aria-hidden="true"
                                className="h-4 w-4"
                                focusable={false}
                              />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
