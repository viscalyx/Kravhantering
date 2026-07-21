'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useRef, useState } from 'react'
import DirtyStateButton from '@/components/DirtyStateButton'
import FormActionRow from '@/components/FormActionRow'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import IconPicker from '@/components/IconPicker'
import RequiredFieldMarker from '@/components/RequiredFieldMarker'
import StatusBadge from '@/components/StatusBadge'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'
import { Link } from '@/i18n/routing'
import { getBadgeContrastColors, isStrictHexColor } from '@/lib/color-contrast'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { offsetPanelMotion } from '@/lib/reduced-motion'

const PRIORITY_LEVELS_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'priorityLevels.overview.body',
      headingKey: 'priorityLevels.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'priorityLevels.manage.body',
      headingKey: 'priorityLevels.manage.heading',
    },
  ],
  titleKey: 'priorityLevels.title',
}

interface PriorityLevel {
  assessmentCriteriaEn: string
  assessmentCriteriaSv: string
  code: string
  color: string
  descriptionEn: string
  descriptionSv: string
  iconName: string | null
  id: number
  linkedRequirementCount: number
  nameEn: string
  nameSv: string
  sortOrder: number
}

interface PriorityLevelForm {
  assessmentCriteriaEn: string
  assessmentCriteriaSv: string
  code: string
  color: string
  descriptionEn: string
  descriptionSv: string
  iconName: string | null
  nameEn: string
  nameSv: string
  sortOrder: string
}

interface LinkedRequirement {
  description: string | null
  id: number
  source: 'library' | 'specificationLocal'
  statusColor: string | null
  statusIconName: string | null
  statusNameEn: string | null
  statusNameSv: string | null
  uniqueId: string
  versionNumber: number
}

const DESCRIPTION_TRUNCATE = 80

const getInitialForm = (): PriorityLevelForm => ({
  assessmentCriteriaEn: '',
  assessmentCriteriaSv: '',
  code: '',
  color: '#3b82f6',
  descriptionEn: '',
  descriptionSv: '',
  iconName: null,
  nameEn: '',
  nameSv: '',
  sortOrder: '0',
})

const toForm = (priorityLevel: PriorityLevel): PriorityLevelForm => ({
  assessmentCriteriaEn: priorityLevel.assessmentCriteriaEn,
  assessmentCriteriaSv: priorityLevel.assessmentCriteriaSv,
  code: priorityLevel.code,
  color: priorityLevel.color,
  descriptionEn: priorityLevel.descriptionEn,
  descriptionSv: priorityLevel.descriptionSv,
  iconName: priorityLevel.iconName ?? null,
  nameEn: priorityLevel.nameEn,
  nameSv: priorityLevel.nameSv,
  sortOrder: String(priorityLevel.sortOrder),
})

const toPayload = (form: PriorityLevelForm) => ({
  assessmentCriteriaSv: form.assessmentCriteriaSv,
  assessmentCriteriaEn: form.assessmentCriteriaEn,
  nameSv: form.nameSv,
  nameEn: form.nameEn,
  descriptionSv: form.descriptionSv,
  descriptionEn: form.descriptionEn,
  color: form.color,
  iconName: form.iconName,
  sortOrder: form.sortOrder.trim() === '' ? null : Number(form.sortOrder),
})

const inputClassName =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'
const textareaClassName = `${inputClassName} min-h-24 resize-y`

export default function PriorityLevelsClient() {
  useHelpContent(PRIORITY_LEVELS_HELP)
  const t = useTranslations('priorityLevelAdmin')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const tr = useTranslations('requirement')
  const locale = useLocale()
  const shouldReduceMotion = useReducedMotion()
  const [linkedRequirements, setLinkedRequirements] = useState<
    LinkedRequirement[]
  >([])
  const [linkedRequirementsLoading, setLinkedRequirementsLoading] =
    useState(false)
  const linkedReqRequestId = useRef(0)

  const getName = (priorityLevel: PriorityLevel) =>
    locale === 'sv' ? priorityLevel.nameSv : priorityLevel.nameEn
  const getDescription = (priorityLevel: PriorityLevel) =>
    locale === 'sv' ? priorityLevel.descriptionSv : priorityLevel.descriptionEn
  const getAssessmentCriteria = (priorityLevel: PriorityLevel) =>
    locale === 'sv'
      ? priorityLevel.assessmentCriteriaSv
      : priorityLevel.assessmentCriteriaEn

  const controller = useCrudAdminResource<PriorityLevel, PriorityLevelForm>({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/priority-levels',
    errorMessage: tc('error'),
    getInitialForm,
    listKey: 'priorityLevels',
    toForm,
    toPayload,
  })
  const previewColors = getBadgeContrastColors(controller.form.color)
  const previewName =
    locale === 'sv' ? controller.form.nameSv : controller.form.nameEn
  const previewLabel = [controller.form.code, previewName]
    .filter(Boolean)
    .join(' – ')
  const invalidStoredPriorityCodes = controller.items
    .filter(priorityLevel => !isStrictHexColor(priorityLevel.color))
    .map(priorityLevel => priorityLevel.code)

  const fetchLinkedRequirements = useCallback(
    async (priorityLevelId: number) => {
      const requestId = ++linkedReqRequestId.current
      setLinkedRequirementsLoading(true)
      try {
        const response = await apiFetch(
          `/api/priority-levels/${priorityLevelId}`,
        )
        if (requestId !== linkedReqRequestId.current) return
        if (!response.ok) {
          setLinkedRequirements([])
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
        }
      } finally {
        if (requestId === linkedReqRequestId.current) {
          setLinkedRequirementsLoading(false)
        }
      }
    },
    [],
  )

  const openEdit = (priorityLevel: PriorityLevel) => {
    controller.openEdit(priorityLevel)
    void fetchLinkedRequirements(priorityLevel.id)
  }

  const closeForm = async (anchorEl?: HTMLElement | null) => {
    if (!(await controller.closeForm(anchorEl))) return
    setLinkedRequirements([])
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    const didSubmit = await controller.submit(event)
    if (didSubmit) setLinkedRequirements([])
  }

  const truncateDescription = (text: string | null) => {
    if (!text) return null
    if (text.length <= DESCRIPTION_TRUNCATE) return text
    return `${text.slice(0, DESCRIPTION_TRUNCATE)}…`
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('priorityLevels')}
          </h1>
        </div>

        {(controller.deleteError || controller.loadError) && (
          <p
            className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
            {...devMarker({
              context: 'priority-levels',
              name: 'error banner',
              priority: 340,
              value: controller.deleteError ? 'delete-error' : 'load-error',
            })}
            role="alert"
          >
            {controller.deleteError ?? controller.loadError}
          </p>
        )}

        {invalidStoredPriorityCodes.length > 0 && (
          <p
            className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
            {...devMarker({
              context: 'priority-levels',
              name: 'invalid color warning',
              priority: 350,
              value: invalidStoredPriorityCodes.join(','),
            })}
            role="alert"
          >
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            {t('invalidStoredColors', {
              codes: invalidStoredPriorityCodes.join(', '),
            })}
          </p>
        )}

        <AnimatePresence>
          {controller.showForm && (
            <motion.div
              className="glass rounded-2xl p-6 mb-6"
              {...offsetPanelMotion(shouldReduceMotion)}
            >
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 items-start">
                <form
                  className="space-y-5"
                  {...devMarker({
                    context: 'priority-levels',
                    name: 'crud form',
                    priority: 340,
                    value: 'edit',
                  })}
                  onSubmit={submit}
                >
                  <h2 className="text-lg font-semibold">{t('editItem')}</h2>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <div>
                      <label
                        className="block text-sm font-medium mb-1"
                        htmlFor="priority-code"
                      >
                        {t('code')}
                      </label>
                      <input
                        className={`${inputClassName} bg-secondary-50 text-secondary-600 dark:bg-secondary-800 dark:text-secondary-300`}
                        disabled
                        id="priority-code"
                        value={controller.form.code}
                      />
                      <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                        {t('codeHelp')}
                      </p>
                    </div>
                    <div>
                      <label
                        className="block text-sm font-medium mb-1"
                        htmlFor="priority-sort-order"
                      >
                        {t('sortOrder')}
                      </label>
                      <input
                        className={inputClassName}
                        disabled={controller.submitting}
                        id="priority-sort-order"
                        min="0"
                        onChange={event =>
                          controller.setForm(previousForm => ({
                            ...previousForm,
                            sortOrder: event.target.value,
                          }))
                        }
                        type="number"
                        value={controller.form.sortOrder}
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="priority-name-sv"
                    >
                      {t('name')} (SV)
                      <RequiredFieldMarker />
                    </label>
                    <input
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="priority-name-sv"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          nameSv: event.target.value,
                        }))
                      }
                      required
                      value={controller.form.nameSv}
                    />
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="priority-name-en"
                    >
                      {t('name')} (EN)
                      <RequiredFieldMarker />
                    </label>
                    <input
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="priority-name-en"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          nameEn: event.target.value,
                        }))
                      }
                      required
                      value={controller.form.nameEn}
                    />
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="priority-description-sv"
                    >
                      {t('description')} (SV)
                      <RequiredFieldMarker />
                    </label>
                    <textarea
                      className={textareaClassName}
                      disabled={controller.submitting}
                      id="priority-description-sv"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          descriptionSv: event.target.value,
                        }))
                      }
                      required
                      value={controller.form.descriptionSv}
                    />
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="priority-description-en"
                    >
                      {t('description')} (EN)
                      <RequiredFieldMarker />
                    </label>
                    <textarea
                      className={textareaClassName}
                      disabled={controller.submitting}
                      id="priority-description-en"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          descriptionEn: event.target.value,
                        }))
                      }
                      required
                      value={controller.form.descriptionEn}
                    />
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="priority-assessment-criteria-sv"
                    >
                      {t('assessmentCriteria')} (SV)
                      <RequiredFieldMarker />
                    </label>
                    <textarea
                      className={textareaClassName}
                      disabled={controller.submitting}
                      id="priority-assessment-criteria-sv"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          assessmentCriteriaSv: event.target.value,
                        }))
                      }
                      required
                      value={controller.form.assessmentCriteriaSv}
                    />
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="priority-assessment-criteria-en"
                    >
                      {t('assessmentCriteria')} (EN)
                      <RequiredFieldMarker />
                    </label>
                    <textarea
                      className={textareaClassName}
                      disabled={controller.submitting}
                      id="priority-assessment-criteria-en"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          assessmentCriteriaEn: event.target.value,
                        }))
                      }
                      required
                      value={controller.form.assessmentCriteriaEn}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <div className="min-w-0">
                      <label
                        className="block text-sm font-medium mb-1"
                        htmlFor="priority-color-hex"
                      >
                        {t('color')}
                        <RequiredFieldMarker />
                      </label>
                      <div className="flex items-center gap-3">
                        {isStrictHexColor(controller.form.color) && (
                          <>
                            <label
                              className="sr-only"
                              htmlFor="priority-color-picker"
                            >
                              {t('colorPicker')}
                            </label>
                            <input
                              className="h-10 w-14 shrink-0 rounded-lg border cursor-pointer"
                              disabled={controller.submitting}
                              id="priority-color-picker"
                              onChange={event =>
                                controller.setForm(previousForm => ({
                                  ...previousForm,
                                  color: event.target.value,
                                }))
                              }
                              required
                              type="color"
                              value={controller.form.color}
                            />
                          </>
                        )}
                        <input
                          aria-label={t('colorHex')}
                          className={`${inputClassName} min-w-0`}
                          disabled={controller.submitting}
                          id="priority-color-hex"
                          onChange={event =>
                            controller.setForm(previousForm => ({
                              ...previousForm,
                              color: event.target.value,
                            }))
                          }
                          pattern="^#[0-9a-fA-F]{6}$"
                          placeholder="#3b82f6"
                          required
                          value={controller.form.color}
                        />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <label
                        className="block text-sm font-medium mb-1"
                        htmlFor="priority-icon"
                      >
                        {t('icon')}
                      </label>
                      <div className="flex items-center gap-3">
                        <IconPicker
                          disabled={controller.submitting}
                          id="priority-icon"
                          label={t('icon')}
                          onChange={iconName =>
                            controller.setForm(previousForm => ({
                              ...previousForm,
                              iconName,
                            }))
                          }
                          value={controller.form.iconName}
                        />
                      </div>
                    </div>
                  </div>
                  <section
                    aria-label={t('themePreview')}
                    className="space-y-3 rounded-xl border border-secondary-200 p-4 dark:border-secondary-700"
                    {...devMarker({
                      context: 'priority-levels',
                      name: 'theme contrast preview',
                      priority: 350,
                      value: 'light-dark',
                    })}
                    role="status"
                  >
                    <div>
                      <h3 className="text-sm font-semibold">
                        {t('themePreview')}
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-secondary-600 dark:text-secondary-300">
                        {t('themePreviewGuidance')}
                      </p>
                    </div>
                    {previewColors ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {(['light', 'dark'] as const).map(theme => {
                          const themeColors = previewColors[theme]
                          return (
                            <div
                              className={
                                theme === 'light'
                                  ? 'rounded-lg border border-secondary-200 bg-white p-3 text-secondary-900'
                                  : 'rounded-lg border border-secondary-700 bg-secondary-900 p-3 text-secondary-100'
                              }
                              key={theme}
                            >
                              <p className="mb-2 text-xs font-semibold">
                                {theme === 'light'
                                  ? t('lightTheme')
                                  : t('darkTheme')}
                              </p>
                              <StatusBadge
                                color={controller.form.color}
                                iconName={controller.form.iconName}
                                label={previewLabel}
                                theme={theme}
                              />
                              <p className="mt-2 flex items-center gap-1 text-xs">
                                <CheckCircle2
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                />
                                {t('contrastResult', {
                                  ratio: themeColors.ratio.toFixed(2),
                                })}{' '}
                                {t('contrastPass')}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                        <AlertTriangle
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0"
                        />
                        {t('invalidColorWarning')}
                      </p>
                    )}
                  </section>
                  {controller.formError && (
                    <p
                      className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
                      role="alert"
                    >
                      {controller.formError}
                    </p>
                  )}
                  <FormActionRow>
                    <DirtyStateButton
                      className="btn-primary"
                      dirty={controller.formDirty}
                      disabled={controller.submitting}
                      type="submit"
                    >
                      {controller.submitting ? tc('saving') : tc('save')}
                    </DirtyStateButton>
                    <button
                      className="px-4 py-2.5 rounded-xl border text-sm min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 transition-all duration-200"
                      disabled={controller.submitting}
                      onClick={event => void closeForm(event.currentTarget)}
                      type="button"
                    >
                      {tc('cancel')}
                    </button>
                  </FormActionRow>
                </form>

                {controller.editId && (
                  <div>
                    <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-3">
                      {t('linkedRequirements')}
                    </h3>
                    {linkedRequirementsLoading ? (
                      <p className="text-sm text-secondary-500 dark:text-secondary-400">
                        {tc('loading')}
                      </p>
                    ) : linkedRequirements.length === 0 ? (
                      <p className="text-sm text-secondary-500 dark:text-secondary-400">
                        {tc('noneAvailable')}
                      </p>
                    ) : (
                      <div className="rounded-xl border overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                              <th className="py-2 px-3 font-medium">
                                {tr('uniqueId')}
                              </th>
                              <th className="py-2 px-3 font-medium">
                                {tr('description')}
                              </th>
                              <th className="py-2 px-3 font-medium">
                                {tc('version')}
                              </th>
                              <th className="py-2 px-3 font-medium">
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
                                  className="border-b last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                                  key={`${requirement.id}-v${requirement.versionNumber}`}
                                >
                                  <td className="py-2 px-3 font-medium">
                                    <Link
                                      className="inline-flex items-center min-h-11 min-w-11 text-primary-700 dark:text-primary-300 hover:underline"
                                      href={`/requirements/${requirement.uniqueId}/${requirement.versionNumber}`}
                                    >
                                      {requirement.uniqueId}
                                    </Link>
                                  </td>
                                  <td
                                    className="py-2 px-3 text-secondary-600 dark:text-secondary-400 max-w-xs"
                                    title={
                                      isTruncated
                                        ? (requirement.description ?? undefined)
                                        : undefined
                                    }
                                  >
                                    {truncated ?? '—'}
                                  </td>
                                  <td className="py-2 px-3 text-secondary-600 dark:text-secondary-400">
                                    v{requirement.versionNumber}
                                  </td>
                                  <td className="py-2 px-3">
                                    <StatusBadge
                                      color={requirement.statusColor}
                                      iconName={requirement.statusIconName}
                                      label={
                                        (locale === 'sv'
                                          ? requirement.statusNameSv
                                          : requirement.statusNameEn) ?? ''
                                      }
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
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {controller.loading ? (
          <p className="text-secondary-600 dark:text-secondary-400">
            {tc('loading')}
          </p>
        ) : (
          <div
            className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm overflow-x-auto"
            {...devMarker({
              context: 'priority-levels',
              name: 'crud table',
              priority: 340,
            })}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                  <th className="py-3 px-4 font-medium">{t('priority')}</th>
                  <th className="py-3 px-4 font-medium">{t('description')}</th>
                  <th className="py-3 px-4 font-medium">
                    {t('assessmentCriteria')}
                  </th>
                  <th className="py-3 px-4 font-medium">{t('sortOrder')}</th>
                  <th className="py-3 px-4 font-medium text-center">
                    {t('linkedRequirements')}
                  </th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {controller.items.length === 0 ? (
                  <tr
                    {...devMarker({
                      context: 'priority-levels',
                      name: 'empty state',
                      priority: 330,
                    })}
                  >
                    <td
                      className="px-4 py-10 text-center text-secondary-500 dark:text-secondary-400"
                      colSpan={6}
                    >
                      {t('emptyState')}
                    </td>
                  </tr>
                ) : (
                  controller.items.map(priorityLevel => {
                    const localizedDescription = getDescription(priorityLevel)
                    const localizedAssessmentCriteria =
                      getAssessmentCriteria(priorityLevel)

                    return (
                      <tr
                        className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                        key={priorityLevel.id}
                      >
                        <td className="py-3 px-4 font-medium">
                          <StatusBadge
                            color={priorityLevel.color}
                            iconName={priorityLevel.iconName}
                            label={`${priorityLevel.code} – ${getName(priorityLevel)}`}
                          />
                        </td>
                        <td
                          className="max-w-80 py-3 px-4 text-secondary-600 dark:text-secondary-400"
                          title={localizedDescription}
                        >
                          {truncateDescription(localizedDescription)}
                        </td>
                        <td
                          className="max-w-80 py-3 px-4 text-secondary-600 dark:text-secondary-400"
                          title={localizedAssessmentCriteria}
                        >
                          {truncateDescription(localizedAssessmentCriteria)}
                        </td>
                        <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                          {priorityLevel.sortOrder}
                        </td>
                        <td className="py-3 px-4 text-center text-secondary-600 dark:text-secondary-400">
                          {t('requirementCount', {
                            count: priorityLevel.linkedRequirementCount,
                          })}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            className="text-sm text-primary-700 dark:text-primary-300 hover:underline mr-3 min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                            {...devMarker({
                              context: 'priority-levels',
                              name: 'table action',
                              value: 'edit',
                            })}
                            disabled={controller.submitting}
                            onClick={() => openEdit(priorityLevel)}
                            type="button"
                          >
                            {tc('edit')}
                          </button>
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
