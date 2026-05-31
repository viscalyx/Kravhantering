'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Archive, Plus, RotateCcw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useRef, useState } from 'react'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import FloatingActionRail from '@/components/FloatingActionRail'
import FormModal from '@/components/FormModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import StatusBadge from '@/components/StatusBadge'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'
import { Link } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { isSwedish } from '@/lib/i18n/localized'
import { offsetPanelMotion } from '@/lib/reduced-motion'
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
  description: string | null
  id: number
  isArchived: boolean
  leadDisplayName: string
  leadHsaId: string
  linkedRequirementCount: number
  name: string
}

interface RequirementPackageForm {
  description: string
  leadDisplayName: string
  leadHsaId: string
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

const getInitialForm = (): RequirementPackageForm => ({
  description: '',
  leadDisplayName: '',
  leadHsaId: '',
  name: '',
})

const toForm = (
  requirementPackage: RequirementPackage,
): RequirementPackageForm => ({
  description: requirementPackage.description ?? '',
  leadDisplayName: requirementPackage.leadDisplayName,
  leadHsaId: requirementPackage.leadHsaId,
  name: requirementPackage.name,
})

const toPayload = (form: RequirementPackageForm) => ({
  description: form.description || undefined,
  leadDisplayName: form.leadDisplayName,
  leadHsaId: form.leadHsaId,
  name: form.name,
})

const inputClassName =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

export default function RequirementPackagesClient() {
  useHelpContent(REQUIREMENT_PACKAGES_HELP)
  const t = useTranslations('requirementPackage')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const tr = useTranslations('requirement')
  const tStatusLabel = useTranslations('requirement.statusLabel')
  const locale = useLocale()
  const shouldReduceMotion = useReducedMotion()
  const contentRef = useRef<HTMLDivElement>(null)
  const tableAnchorRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
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
    toForm,
    toPayload,
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
    setLinkedRequirements([])
    setLinkedRequirementsError(null)
    setStateError(null)
    controller.openCreate()
  }

  const openEdit = (requirementPackage: RequirementPackage) => {
    setStateError(null)
    controller.openEdit(requirementPackage)
    void fetchLinkedRequirements(requirementPackage.id)
  }

  const closeForm = () => {
    setLinkedRequirements([])
    setLinkedRequirementsError(null)
    controller.closeForm()
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    const didSubmit = await controller.submit(event)
    if (didSubmit) {
      setLinkedRequirements([])
      setLinkedRequirementsError(null)
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

  const renderPackageForm = (heading: string | null) => (
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
      {heading ? <h2 className="text-lg font-semibold">{heading}</h2> : null}
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
      <div>
        <FieldLabelWithHelp
          help={t('leadHsaIdHelp')}
          htmlFor="requirement-package-lead-hsa-id"
          label={t('leadHsaId')}
          required
        />
        <input
          className={inputClassName}
          disabled={controller.submitting}
          id="requirement-package-lead-hsa-id"
          onChange={event =>
            controller.setForm(previousForm => ({
              ...previousForm,
              leadHsaId: event.target.value,
            }))
          }
          pattern="SE[0-9]{10}-[A-Za-z0-9]+"
          required
          value={controller.form.leadHsaId}
        />
      </div>
      <div>
        <FieldLabelWithHelp
          help={t('leadDisplayNameHelp')}
          htmlFor="requirement-package-lead-display-name"
          label={t('leadDisplayName')}
          required
        />
        <input
          className={inputClassName}
          disabled={controller.submitting}
          id="requirement-package-lead-display-name"
          onChange={event =>
            controller.setForm(previousForm => ({
              ...previousForm,
              leadDisplayName: event.target.value,
            }))
          }
          required
          value={controller.form.leadDisplayName}
        />
      </div>
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
          developerModeValue="new requirement package"
          initialFocusRef={nameInputRef}
          onClose={closeForm}
          open={controller.showForm && !controller.editId}
          title={t('newRequirementPackage')}
          titleId="requirement-package-create-title"
        >
          {renderPackageForm(null)}
        </FormModal>

        <AnimatePresence>
          {controller.showForm && controller.editId && (
            <motion.div
              className="glass mb-6 rounded-2xl p-6"
              {...offsetPanelMotion(shouldReduceMotion)}
            >
              <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_1fr]">
                {renderPackageForm(t('editRequirementPackage'))}

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
                            <th className="px-3 py-2 font-medium">
                              {tr('uniqueId')}
                            </th>
                            <th className="px-3 py-2 font-medium">
                              {tr('description')}
                            </th>
                            <th className="px-3 py-2 font-medium">
                              {tc('version')}
                            </th>
                            <th className="px-3 py-2 font-medium">
                              {tr('status')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {linkedRequirements.map(requirement => {
                            const truncated = truncateDescription(
                              requirement.description,
                            )
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
                                        archiveInitiatedAt:
                                          requirement.archiveInitiatedAt,
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
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
                    <td className="px-4 py-10 text-center" colSpan={6}>
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
                ) : (
                  controller.items.map(requirementPackage => (
                    <tr
                      className="border-b transition-colors hover:bg-primary-50/40 dark:hover:bg-primary-950/20"
                      key={requirementPackage.id}
                    >
                      <td className="px-4 py-3 font-medium">
                        {requirementPackage.name}
                      </td>
                      <td
                        className="max-w-xs truncate px-4 py-3 text-secondary-600 dark:text-secondary-400"
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
                        <button
                          className="mr-3 inline-flex min-h-11 min-w-11 items-center rounded text-sm text-primary-700 hover:underline focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:text-primary-300"
                          {...devMarker({
                            context: 'requirementPackages',
                            name: 'table action',
                            value: 'edit',
                          })}
                          disabled={isBusy(requirementPackage)}
                          onClick={() => openEdit(requirementPackage)}
                          type="button"
                        >
                          {tc('edit')}
                        </button>
                        <button
                          className="mr-3 inline-flex min-h-11 min-w-11 items-center gap-1 rounded text-sm text-secondary-700 hover:underline focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:text-secondary-300"
                          disabled={isBusy(requirementPackage)}
                          onClick={() => {
                            void changeArchivedState(
                              requirementPackage,
                              requirementPackage.isArchived
                                ? 'reactivate'
                                : 'archive',
                            )
                          }}
                          type="button"
                        >
                          {requirementPackage.isArchived ? (
                            <RotateCcw aria-hidden="true" className="h-4 w-4" />
                          ) : (
                            <Archive aria-hidden="true" className="h-4 w-4" />
                          )}
                          {requirementPackage.isArchived
                            ? t('reactivate')
                            : t('archive')}
                        </button>
                        <button
                          className="inline-flex min-h-11 min-w-11 items-center rounded text-sm text-red-700 hover:underline focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:text-red-400"
                          {...devMarker({
                            context: 'requirementPackages',
                            name: 'table action',
                            value: 'delete',
                          })}
                          disabled={isBusy(requirementPackage)}
                          onClick={event => {
                            void remove(
                              requirementPackage.id,
                              event.currentTarget,
                            )
                          }}
                          type="button"
                        >
                          {controller.deletingIds.has(requirementPackage.id)
                            ? tc('loading')
                            : tc('delete')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
