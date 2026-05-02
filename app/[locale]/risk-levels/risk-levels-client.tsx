'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useRef, useState } from 'react'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import StatusBadge from '@/components/StatusBadge'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'
import { Link } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'

const RISK_LEVELS_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'riskLevels.overview.body',
      headingKey: 'riskLevels.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'riskLevels.manage.body',
      headingKey: 'riskLevels.manage.heading',
    },
  ],
  titleKey: 'riskLevels.title',
}

interface RiskLevel {
  color: string
  id: number
  linkedRequirementCount: number
  nameEn: string
  nameSv: string
  sortOrder: number
}

interface RiskLevelForm {
  color: string
  nameEn: string
  nameSv: string
  sortOrder: string
}

interface LinkedRequirement {
  description: string | null
  id: number
  statusColor: string | null
  statusNameEn: string | null
  statusNameSv: string | null
  uniqueId: string
  versionNumber: number
}

const DESCRIPTION_TRUNCATE = 80

const getInitialForm = (): RiskLevelForm => ({
  color: '#3b82f6',
  nameEn: '',
  nameSv: '',
  sortOrder: '0',
})

const toForm = (riskLevel: RiskLevel): RiskLevelForm => ({
  color: riskLevel.color,
  nameEn: riskLevel.nameEn,
  nameSv: riskLevel.nameSv,
  sortOrder: String(riskLevel.sortOrder),
})

const toPayload = (form: RiskLevelForm) => ({
  nameSv: form.nameSv,
  nameEn: form.nameEn,
  color: form.color,
  sortOrder: Number(form.sortOrder) || 0,
})

const inputClassName =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

export default function RiskLevelsClient() {
  useHelpContent(RISK_LEVELS_HELP)
  const t = useTranslations('riskLevelAdmin')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const tr = useTranslations('requirement')
  const locale = useLocale()
  const [linkedRequirements, setLinkedRequirements] = useState<
    LinkedRequirement[]
  >([])
  const [linkedRequirementsLoading, setLinkedRequirementsLoading] =
    useState(false)
  const linkedReqRequestId = useRef(0)

  const getName = (riskLevel: RiskLevel) =>
    locale === 'sv' ? riskLevel.nameSv : riskLevel.nameEn

  const controller = useCrudAdminResource<RiskLevel, RiskLevelForm>({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/risk-levels',
    errorMessage: tc('error'),
    getInitialForm,
    listKey: 'riskLevels',
    toForm,
    toPayload,
  })

  const fetchLinkedRequirements = useCallback(
    async (riskLevelId: number) => {
      const requestId = ++linkedReqRequestId.current
      const previousLinkedRequirements = linkedRequirements
      setLinkedRequirementsLoading(true)
      try {
        const response = await apiFetch(`/api/risk-levels/${riskLevelId}`)
        if (requestId !== linkedReqRequestId.current) return
        if (!response.ok) {
          setLinkedRequirements(previousLinkedRequirements)
          return
        }
        const data = (await response.json()) as {
          linkedRequirements?: LinkedRequirement[]
        }
        if (requestId !== linkedReqRequestId.current) return
        setLinkedRequirements(data.linkedRequirements ?? [])
      } catch {
        if (requestId === linkedReqRequestId.current) {
          setLinkedRequirements(previousLinkedRequirements)
        }
      } finally {
        if (requestId === linkedReqRequestId.current) {
          setLinkedRequirementsLoading(false)
        }
      }
    },
    [linkedRequirements],
  )

  const openCreate = () => {
    setLinkedRequirements([])
    controller.openCreate()
  }

  const openEdit = (riskLevel: RiskLevel) => {
    controller.openEdit(riskLevel)
    void fetchLinkedRequirements(riskLevel.id)
  }

  const closeForm = () => {
    setLinkedRequirements([])
    controller.closeForm()
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    const didSubmit = await controller.submit(event)
    if (didSubmit) setLinkedRequirements([])
  }

  const remove = async (id: number, anchorEl?: HTMLElement) => {
    const didRemove = await controller.remove(id, anchorEl)
    if (didRemove && controller.editId === id) setLinkedRequirements([])
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
            {tn('riskLevels')}
          </h1>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            {...devMarker({
              context: 'risk-levels',
              name: 'create button',
              priority: 350,
            })}
            disabled={controller.submitting}
            onClick={openCreate}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {tc('create')}
          </button>
        </div>

        {(controller.deleteError || controller.loadError) && (
          <p
            className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
            {...devMarker({
              context: 'risk-levels',
              name: 'error banner',
              priority: 340,
              value: controller.deleteError ? 'delete-error' : 'load-error',
            })}
            role="alert"
          >
            {controller.deleteError ?? controller.loadError}
          </p>
        )}

        <AnimatePresence>
          {controller.showForm && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-6 mb-6"
              exit={{ opacity: 0, y: 8 }}
              initial={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
            >
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 items-start">
                <form
                  className="space-y-5"
                  {...devMarker({
                    context: 'risk-levels',
                    name: 'crud form',
                    priority: 340,
                    value: controller.editId ? 'edit' : 'create',
                  })}
                  onSubmit={submit}
                >
                  <h2 className="text-lg font-semibold">
                    {controller.editId ? tc('edit') : tc('create')}
                  </h2>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="rl-name-sv"
                    >
                      {t('name')} (SV) <span aria-hidden="true">*</span>
                    </label>
                    <input
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="rl-name-sv"
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
                      htmlFor="rl-name-en"
                    >
                      {t('name')} (EN) <span aria-hidden="true">*</span>
                    </label>
                    <input
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="rl-name-en"
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
                      htmlFor="rl-color"
                    >
                      {t('color')} <span aria-hidden="true">*</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        className="h-10 w-14 rounded-lg border cursor-pointer"
                        disabled={controller.submitting}
                        id="rl-color"
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
                      <input
                        aria-label={t('colorHex')}
                        className={inputClassName}
                        disabled={controller.submitting}
                        onChange={event =>
                          controller.setForm(previousForm => ({
                            ...previousForm,
                            color: event.target.value,
                          }))
                        }
                        pattern="^#[0-9a-fA-F]{6}$"
                        placeholder="#3b82f6"
                        value={controller.form.color}
                      />
                      <span
                        aria-hidden="true"
                        className="inline-block w-6 h-6 rounded-full shrink-0 border"
                        style={{ backgroundColor: controller.form.color }}
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="rl-sort-order"
                    >
                      {t('sortOrder')}
                    </label>
                    <input
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="rl-sort-order"
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
                      className="px-4 py-2.5 rounded-xl border text-sm min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 transition-all duration-200"
                      disabled={controller.submitting}
                      onClick={closeForm}
                      type="button"
                    >
                      {tc('cancel')}
                    </button>
                  </div>
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
                                      className="inline-flex items-center min-h-[44px] min-w-[44px] text-primary-700 dark:text-primary-300 hover:underline"
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
              context: 'risk-levels',
              name: 'crud table',
              priority: 340,
            })}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                  <th className="py-3 px-4 font-medium">{t('color')}</th>
                  <th className="py-3 px-4 font-medium">{t('name')}</th>
                  <th className="py-3 px-4 font-medium">{t('sortOrder')}</th>
                  <th className="py-3 px-4 font-medium text-center">
                    {t('linkedRequirements')}
                  </th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {controller.items.map(riskLevel => (
                  <tr
                    className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                    key={riskLevel.id}
                  >
                    <td className="py-3 px-4">
                      <span
                        aria-hidden="true"
                        className="inline-block w-4 h-4 rounded-full"
                        style={{ backgroundColor: riskLevel.color }}
                      />
                    </td>
                    <td className="py-3 px-4 font-medium">
                      {getName(riskLevel)}
                    </td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                      {riskLevel.sortOrder}
                    </td>
                    <td className="py-3 px-4 text-center text-secondary-600 dark:text-secondary-400">
                      {t('requirementCount', {
                        count: riskLevel.linkedRequirementCount,
                      })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        className="text-sm text-primary-700 dark:text-primary-300 hover:underline mr-3 min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                        {...devMarker({
                          context: 'risk-levels',
                          name: 'table action',
                          value: 'edit',
                        })}
                        disabled={controller.submitting}
                        onClick={() => openEdit(riskLevel)}
                        type="button"
                      >
                        {tc('edit')}
                      </button>
                      <button
                        className="text-sm text-red-700 dark:text-red-400 hover:underline min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                        {...devMarker({
                          context: 'risk-levels',
                          name: 'table action',
                          value: 'delete',
                        })}
                        disabled={
                          controller.submitting ||
                          controller.deletingIds.has(riskLevel.id)
                        }
                        onClick={event => {
                          void remove(riskLevel.id, event.currentTarget)
                        }}
                        type="button"
                      >
                        {controller.deletingIds.has(riskLevel.id)
                          ? tc('loading')
                          : tc('delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
