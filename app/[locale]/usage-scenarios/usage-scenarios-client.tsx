'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import StatusBadge from '@/components/StatusBadge'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'
import { Link } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'

const USAGE_SCENARIOS_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'usageScenarios.overview.body',
      headingKey: 'usageScenarios.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'usageScenarios.manage.body',
      headingKey: 'usageScenarios.manage.heading',
    },
  ],
  titleKey: 'usageScenarios.title',
}

interface Owner {
  email: string
  firstName: string
  id: number
  lastName: string
}

interface Scenario {
  descriptionEn: string | null
  descriptionSv: string | null
  id: number
  linkedRequirementCount: number
  nameEn: string
  nameSv: string
  owner: Owner | null
  ownerId: number | null
}

interface ScenarioForm {
  descriptionEn: string
  descriptionSv: string
  nameEn: string
  nameSv: string
  ownerId: string
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

const getInitialForm = (): ScenarioForm => ({
  descriptionEn: '',
  descriptionSv: '',
  nameEn: '',
  nameSv: '',
  ownerId: '',
})

const toForm = (scenario: Scenario): ScenarioForm => ({
  descriptionEn: scenario.descriptionEn ?? '',
  descriptionSv: scenario.descriptionSv ?? '',
  nameEn: scenario.nameEn,
  nameSv: scenario.nameSv,
  ownerId: scenario.ownerId != null ? String(scenario.ownerId) : '',
})

const toPayload = (form: ScenarioForm) => ({
  nameSv: form.nameSv,
  nameEn: form.nameEn,
  descriptionSv: form.descriptionSv || undefined,
  descriptionEn: form.descriptionEn || undefined,
  ownerId: form.ownerId ? Number(form.ownerId) : null,
})

const inputClassName =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

export default function UsageScenariosClient() {
  useHelpContent(USAGE_SCENARIOS_HELP)
  const t = useTranslations('scenario')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const tr = useTranslations('requirement')
  const locale = useLocale()
  const [owners, setOwners] = useState<Owner[]>([])
  const [linkedRequirements, setLinkedRequirements] = useState<
    LinkedRequirement[]
  >([])
  const [linkedRequirementsLoading, setLinkedRequirementsLoading] =
    useState(false)
  const linkedReqRequestId = useRef(0)

  const getName = (scenario: Scenario) =>
    locale === 'sv' ? scenario.nameSv : scenario.nameEn
  const getDescription = (scenario: Scenario) =>
    locale === 'sv' ? scenario.descriptionSv : scenario.descriptionEn

  const controller = useCrudAdminResource<Scenario, ScenarioForm>({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/usage-scenarios',
    errorMessage: tc('error'),
    getInitialForm,
    listKey: 'scenarios',
    toForm,
    toPayload,
  })

  useEffect(() => {
    let cancelled = false

    async function fetchOwners() {
      try {
        const response = await apiFetch('/api/owners/all')
        if (!response.ok || cancelled) return
        setOwners(
          ((await response.json()) as { owners?: Owner[] }).owners ?? [],
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

  const fetchLinkedRequirements = useCallback(async (scenarioId: number) => {
    const requestId = ++linkedReqRequestId.current
    setLinkedRequirementsLoading(true)
    try {
      const response = await apiFetch(`/api/usage-scenarios/${scenarioId}`)
      if (response.ok && requestId === linkedReqRequestId.current) {
        const data = (await response.json()) as {
          linkedRequirements?: LinkedRequirement[]
        }
        setLinkedRequirements(data.linkedRequirements ?? [])
      }
    } catch {
      // Keep existing linked requirements on error.
    } finally {
      if (requestId === linkedReqRequestId.current) {
        setLinkedRequirementsLoading(false)
      }
    }
  }, [])

  const openCreate = () => {
    setLinkedRequirements([])
    controller.openCreate()
  }

  const openEdit = (scenario: Scenario) => {
    setLinkedRequirements([])
    controller.openEdit(scenario)
    void fetchLinkedRequirements(scenario.id)
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

  const getOwnerName = (scenario: Scenario) => {
    if (scenario.owner) {
      return `${scenario.owner.firstName} ${scenario.owner.lastName}`
    }
    return '—'
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
            {tn('scenarios')}
          </h1>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            {...devMarker({
              context: 'scenarios',
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
              context: 'scenarios',
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
                    context: 'scenarios',
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
                      htmlFor="scen-name-sv"
                    >
                      {t('name')} (SV) *
                    </label>
                    <input
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="scen-name-sv"
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
                      htmlFor="scen-name-en"
                    >
                      {t('name')} (EN) *
                    </label>
                    <input
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="scen-name-en"
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
                      htmlFor="scen-desc-sv"
                    >
                      {t('description')} (SV)
                    </label>
                    <textarea
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="scen-desc-sv"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          descriptionSv: event.target.value,
                        }))
                      }
                      value={controller.form.descriptionSv}
                    />
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="scen-desc-en"
                    >
                      {t('description')} (EN)
                    </label>
                    <textarea
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="scen-desc-en"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          descriptionEn: event.target.value,
                        }))
                      }
                      value={controller.form.descriptionEn}
                    />
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="scen-owner"
                    >
                      {t('owner')}
                    </label>
                    <select
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="scen-owner"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          ownerId: event.target.value,
                        }))
                      }
                      value={controller.form.ownerId}
                    >
                      <option value="">—</option>
                      {owners.map(owner => (
                        <option key={owner.id} value={owner.id}>
                          {owner.firstName} {owner.lastName}
                        </option>
                      ))}
                    </select>
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
              context: 'scenarios',
              name: 'crud table',
              priority: 340,
            })}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                  <th className="py-3 px-4 font-medium">{t('name')}</th>
                  <th className="py-3 px-4 font-medium">{t('description')}</th>
                  <th className="py-3 px-4 font-medium">{t('owner')}</th>
                  <th className="py-3 px-4 font-medium text-center">
                    {t('linkedRequirements')}
                  </th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {controller.items.map(scenario => (
                  <tr
                    className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                    key={scenario.id}
                  >
                    <td className="py-3 px-4 font-medium">
                      {getName(scenario)}
                    </td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400 max-w-xs truncate">
                      {getDescription(scenario) || '—'}
                    </td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                      {getOwnerName(scenario)}
                    </td>
                    <td className="py-3 px-4 text-center text-secondary-600 dark:text-secondary-400">
                      {t('requirementCount', {
                        count: scenario.linkedRequirementCount,
                      })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        className="text-sm text-primary-700 dark:text-primary-300 hover:underline mr-3 min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                        {...devMarker({
                          context: 'scenarios',
                          name: 'table action',
                          value: 'edit',
                        })}
                        disabled={controller.submitting}
                        onClick={() => openEdit(scenario)}
                        type="button"
                      >
                        {tc('edit')}
                      </button>
                      <button
                        className="text-sm text-red-700 dark:text-red-400 hover:underline min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                        {...devMarker({
                          context: 'scenarios',
                          name: 'table action',
                          value: 'delete',
                        })}
                        disabled={
                          controller.submitting ||
                          controller.deletingIds.has(scenario.id)
                        }
                        onClick={event => {
                          void remove(scenario.id, event.currentTarget)
                        }}
                        type="button"
                      >
                        {controller.deletingIds.has(scenario.id)
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
