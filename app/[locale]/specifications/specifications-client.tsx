'use client'

import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import FloatingActionRail from '@/components/FloatingActionRail'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { Link } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'
import type {
  RequirementsSpecificationsInitialData,
  Specification,
  SpecificationTaxonomyItem,
} from '@/lib/specifications/preload-types'
import SpecificationFormModal, {
  type SpecificationFormModalCurrentUser,
} from './specification-form-modal'

const REQUIREMENT_SPECIFICATIONS_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'requirementsSpecifications.overview.body',
      headingKey: 'requirementsSpecifications.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementsSpecifications.create.body',
      headingKey: 'requirementsSpecifications.create.heading',
    },
  ],
  titleKey: 'requirementsSpecifications.title',
}

const REQUIREMENT_AREA_PILL_ROW_HEIGHT = 24
const EMPTY_INITIAL_DATA: RequirementsSpecificationsInitialData = {
  errors: [],
  implementationTypes: [],
  lifecycleStatuses: [],
  governanceObjectTypes: [],
  specifications: [],
}

async function readJsonOrThrow<T>(response: Response, fallbackMessage: string) {
  if (!response.ok) {
    const details = await readResponseMessage(response)
    throw new Error(
      details ? `${fallbackMessage}: ${details}` : fallbackMessage,
    )
  }

  return (await response.json()) as T
}

function readCurrentUser(
  body: unknown,
): SpecificationFormModalCurrentUser | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  if (record.authenticated !== true || typeof record.hsaId !== 'string') {
    return null
  }

  const hsaId = record.hsaId.trim()
  if (!hsaId) return null

  const name =
    typeof record.name === 'string' && record.name.trim()
      ? record.name.trim()
      : hsaId
  const email = typeof record.email === 'string' ? record.email : ''

  return {
    displayName: name,
    email,
    hsaId,
    roles: Array.isArray(record.roles)
      ? record.roles.filter((role): role is string => typeof role === 'string')
      : [],
  }
}

function RequirementAreaPills({
  areas,
}: {
  areas: Specification['requirementAreas']
}) {
  const tc = useTranslations('common')
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const updateCanExpand = useCallback(() => {
    const list = listRef.current
    if (!list) {
      return
    }

    const nextCanExpand =
      list.scrollHeight > REQUIREMENT_AREA_PILL_ROW_HEIGHT + 1
    setCanExpand(nextCanExpand)
    if (!nextCanExpand) {
      setExpanded(false)
    }
  }, [])

  useEffect(() => {
    const list = listRef.current
    if (!list) {
      return
    }

    updateCanExpand()
    const frame = window.requestAnimationFrame(updateCanExpand)

    const handleResize = () => updateCanExpand()
    window.addEventListener('resize', handleResize)

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateCanExpand)
    resizeObserver?.observe(list)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleResize)
      resizeObserver?.disconnect()
    }
  }, [updateCanExpand])

  const toggleLabel = expanded ? tc('showLess') : tc('showMore')

  return (
    <div
      className={`flex gap-1 ${expanded ? 'items-start' : 'items-center'}`}
      data-specification-requirement-area-pills="true"
    >
      <div
        className={`flex min-w-0 flex-1 flex-wrap gap-1 ${expanded ? '' : 'max-h-6 overflow-hidden'}`}
        data-specification-requirement-area-pill-list="true"
        ref={listRef}
      >
        {areas.map(area => (
          <span
            className="inline-flex h-6 items-center whitespace-nowrap rounded-full border border-primary-200/80 bg-primary-50/80 px-2 text-[11px] font-medium text-primary-700 dark:border-primary-800/60 dark:bg-primary-950/30 dark:text-primary-300"
            data-specification-requirement-area-pill="true"
            key={area.id}
          >
            {area.name}
          </span>
        ))}
      </div>
      {canExpand ? (
        <button
          aria-expanded={expanded}
          aria-label={toggleLabel}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 dark:text-primary-300 dark:hover:bg-primary-950/30"
          data-specification-requirement-area-pill-toggle="true"
          {...devMarker({
            context: 'specifications',
            name: 'table action',
            value: expanded
              ? 'collapse requirement areas'
              : 'expand requirement areas',
          })}
          onClick={() => setExpanded(value => !value)}
          title={toggleLabel}
          type="button"
        >
          {expanded ? (
            <ChevronUp
              aria-hidden="true"
              className="h-3.5 w-3.5"
              focusable={false}
            />
          ) : (
            <ChevronDown
              aria-hidden="true"
              className="h-3.5 w-3.5"
              focusable={false}
            />
          )}
        </button>
      ) : null}
    </div>
  )
}

export default function RequirementsSpecificationsClient({
  initialData,
}: {
  initialData?: RequirementsSpecificationsInitialData
}) {
  useHelpContent(REQUIREMENT_SPECIFICATIONS_HELP)
  const t = useTranslations('specification')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()
  const contentRef = useRef<HTMLDivElement>(null)
  const tableAnchorRef = useRef<HTMLDivElement>(null)
  const hasInitialData = initialData !== undefined
  const resolvedInitialData = initialData ?? EMPTY_INITIAL_DATA
  const initialDataErrorKeys = new Set(
    resolvedInitialData.errors.map(error => error.key),
  )
  const hasUsableInitialResource = (items: readonly unknown[], key: string) =>
    hasInitialData && (items.length > 0 || !initialDataErrorKeys.has(key))
  const hasInitialGovernanceObjectTypes = hasUsableInitialResource(
    resolvedInitialData.governanceObjectTypes,
    'specification governance object types',
  )
  const hasInitialImplementationTypes = hasUsableInitialResource(
    resolvedInitialData.implementationTypes,
    'specification implementation types',
  )
  const hasInitialLifecycleStatuses = hasUsableInitialResource(
    resolvedInitialData.lifecycleStatuses,
    'specification lifecycle statuses',
  )
  const hasInitialSpecifications = hasUsableInitialResource(
    resolvedInitialData.specifications,
    'requirements specifications',
  )

  const getName = (spec: Specification) => spec.name
  const getTaxonomyName = (item: SpecificationTaxonomyItem | null) =>
    item ? (locale === 'sv' ? item.nameSv : item.nameEn) : '—'
  const getResponsibleDisplayName = (spec: Specification) =>
    formatActorDisplayNameForLocale(spec.responsibleDisplayName, locale) ?? null
  const specificationTableColumnCount = 8

  const governanceObjectTypesResource = useAsyncResource<
    SpecificationTaxonomyItem[]
  >({
    fetcher: async signal => {
      const response = await apiFetch(
        '/api/specification-governance-object-types',
        {
          signal,
        },
      )
      const data = await readJsonOrThrow<{
        governanceObjectTypes?: SpecificationTaxonomyItem[]
      }>(response, t('partialDataLoadWarning'))
      return data.governanceObjectTypes ?? []
    },
    getErrorMessage: error => {
      console.error(
        'Failed to load specification governance object types',
        error,
      )
      return error instanceof Error
        ? error.message
        : t('partialDataLoadWarning')
    },
    key: 'specification-governance-object-types',
    loadOnMount: !hasInitialGovernanceObjectTypes,
    ...(hasInitialGovernanceObjectTypes
      ? { initialData: resolvedInitialData.governanceObjectTypes }
      : {}),
  })
  const implementationTypesResource = useAsyncResource<
    SpecificationTaxonomyItem[]
  >({
    fetcher: async signal => {
      const response = await apiFetch(
        '/api/specification-implementation-types',
        {
          signal,
        },
      )
      const data = await readJsonOrThrow<{
        types?: SpecificationTaxonomyItem[]
      }>(response, t('partialDataLoadWarning'))
      return data.types ?? []
    },
    getErrorMessage: error => {
      console.error('Failed to load specification implementation types', error)
      return error instanceof Error
        ? error.message
        : t('partialDataLoadWarning')
    },
    key: 'specification-implementation-types',
    loadOnMount: !hasInitialImplementationTypes,
    ...(hasInitialImplementationTypes
      ? { initialData: resolvedInitialData.implementationTypes }
      : {}),
  })
  const lifecycleStatusesResource = useAsyncResource<
    SpecificationTaxonomyItem[]
  >({
    fetcher: async signal => {
      const response = await apiFetch('/api/specification-lifecycle-statuses', {
        signal,
      })
      const data = await readJsonOrThrow<{
        statuses?: SpecificationTaxonomyItem[]
      }>(response, t('partialDataLoadWarning'))
      return data.statuses ?? []
    },
    getErrorMessage: error => {
      console.error('Failed to load specification lifecycle statuses', error)
      return error instanceof Error
        ? error.message
        : t('partialDataLoadWarning')
    },
    key: 'specification-lifecycle-statuses',
    loadOnMount: !hasInitialLifecycleStatuses,
    ...(hasInitialLifecycleStatuses
      ? { initialData: resolvedInitialData.lifecycleStatuses }
      : {}),
  })
  const governanceObjectTypes = governanceObjectTypesResource.data ?? []
  const implementationTypes = implementationTypesResource.data ?? []
  const lifecycleStatuses = lifecycleStatusesResource.data ?? []
  const specificationsResource = useAsyncResource<Specification[]>({
    fetcher: async signal => {
      const res = await apiFetch('/api/specifications', { signal })
      if (!res.ok) {
        const details = await readResponseMessage(res)
        throw new Error(
          details
            ? `${t('loadSpecificationsFailed')}: ${details}`
            : t('loadSpecificationsFailed'),
        )
      }
      return (
        ((await res.json()) as { specifications?: Specification[] })
          .specifications ?? []
      )
    },
    getErrorMessage: error => {
      console.error('Failed to load requirements specifications', error)
      return error instanceof Error
        ? error.message
        : t('loadSpecificationsFailed')
    },
    key: 'requirements-specifications',
    loadOnMount: !hasInitialSpecifications,
    ...(hasInitialSpecifications
      ? { initialData: resolvedInitialData.specifications }
      : {}),
  })
  const specifications = specificationsResource.data ?? []
  const loading = specificationsResource.loading
  const isFetchingSpecifications =
    specificationsResource.loading || specificationsResource.refreshing
  const fetchError = specificationsResource.error
  const loadWarning =
    specificationsResource.refreshError ??
    governanceObjectTypesResource.refreshError ??
    implementationTypesResource.refreshError ??
    lifecycleStatusesResource.refreshError ??
    (resolvedInitialData.errors.length > 0 ? t('partialDataLoadWarning') : null)
  const [showSpinner, setShowSpinner] = useState(false)
  const spinnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editSpec, setEditSpec] = useState<Specification | null>(null)
  const [nameFilter, setNameFilter] = useState('')
  const [currentUser, setCurrentUser] =
    useState<SpecificationFormModalCurrentUser | null>(null)
  const [currentUserLoading, setCurrentUserLoading] = useState(true)
  const [currentUserUnavailable, setCurrentUserUnavailable] = useState(false)
  const deferredNameFilter = useDeferredValue(nameFilter)
  const normalizedNameFilter = deferredNameFilter
    .trim()
    .toLocaleLowerCase(locale)
  const hasActiveNameFilter = nameFilter.trim().length > 0
  const filteredSpecifications = specifications.filter(spec =>
    getName(spec).toLocaleLowerCase(locale).includes(normalizedNameFilter),
  )

  useEffect(() => {
    const controller = new AbortController()
    setCurrentUserLoading(true)
    setCurrentUserUnavailable(false)

    async function loadCurrentUser() {
      try {
        const response = await apiFetch('/api/auth/me', {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error('Failed to load current user')
        }
        const user = readCurrentUser(await response.json())
        if (!user) {
          setCurrentUser(null)
          setCurrentUserUnavailable(true)
          return
        }
        setCurrentUser(user)
      } catch (error) {
        if (controller.signal.aborted) return
        console.error('Failed to load current user for specifications', error)
        setCurrentUser(null)
        setCurrentUserUnavailable(true)
      } finally {
        if (!controller.signal.aborted) {
          setCurrentUserLoading(false)
        }
      }
    }

    void loadCurrentUser()

    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (!isFetchingSpecifications) {
      if (spinnerTimerRef.current) {
        clearTimeout(spinnerTimerRef.current)
        spinnerTimerRef.current = null
      }
      setShowSpinner(false)
      return
    }

    if (spinnerTimerRef.current) {
      clearTimeout(spinnerTimerRef.current)
    }
    spinnerTimerRef.current = setTimeout(() => {
      setShowSpinner(true)
    }, 200)

    return () => {
      if (spinnerTimerRef.current) {
        clearTimeout(spinnerTimerRef.current)
        spinnerTimerRef.current = null
      }
    }
  }, [isFetchingSpecifications])

  const handleEdit = (spec: Specification) => {
    setEditSpec(spec)
    setShowForm(true)
  }

  const { confirm } = useConfirmModal()

  const handleDelete = async (spec: Specification, anchorEl?: HTMLElement) => {
    if (
      !(await confirm({
        message: tc('confirm'),
        variant: 'danger',
        icon: 'caution',
        anchorEl,
      }))
    )
      return

    try {
      const res = await apiFetch(`/api/specifications/${spec.uniqueId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const details = (await res.text()).trim()
        await confirm({
          anchorEl,
          confirmText: tc('confirm'),
          icon: 'caution',
          message: details || tc('error'),
          showCancel: false,
          title: tc('error'),
          variant: 'danger',
        })
        return
      }

      await specificationsResource.reload()
    } catch (error) {
      await confirm({
        anchorEl,
        confirmText: tc('confirm'),
        icon: 'caution',
        message: error instanceof Error ? error.message : tc('error'),
        showCancel: false,
        title: tc('error'),
        variant: 'danger',
      })
    }
  }

  const openCreateForm = () => {
    if (!currentUser) {
      return
    }
    setShowForm(true)
    setEditSpec(null)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditSpec(null)
  }

  const currentUserError = currentUserUnavailable
    ? t('currentUserUnavailable')
    : null
  const createDisabled = currentUserLoading || !currentUser
  const createDisabledReason = currentUserLoading
    ? t('currentUserLoading')
    : currentUserError

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom" ref={contentRef}>
        <FloatingActionRail
          anchorRef={tableAnchorRef}
          developerModeContext="specifications"
          items={[
            {
              ariaLabel: t('newSpecification'),
              developerModeValue: 'new specification',
              disabled: createDisabled,
              icon: <Plus aria-hidden="true" className="h-4 w-4" />,
              id: 'create',
              onClick: openCreateForm,
              tooltip: createDisabledReason ?? t('newSpecification'),
              variant: 'primary',
            },
          ]}
        />
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('specifications')}
          </h1>
        </div>

        {loadWarning ? (
          <p
            className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
            role="alert"
          >
            {loadWarning}
          </p>
        ) : null}
        {currentUserError ? (
          <p
            className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
            role="alert"
          >
            {currentUserError}
          </p>
        ) : null}

        <SpecificationFormModal
          currentUser={currentUser}
          currentUserLoading={currentUserLoading}
          developerModeContext="specifications"
          governanceObjectTypes={governanceObjectTypes}
          implementationTypes={implementationTypes}
          lifecycleStatuses={lifecycleStatuses}
          mode={editSpec ? 'edit' : 'create'}
          onClose={closeForm}
          onResponsibleChanged={async () => {
            await specificationsResource.reload()
          }}
          onSaved={async () => {
            closeForm()
            await specificationsResource.reload()
          }}
          open={showForm}
          spec={editSpec}
          specificationSlug={editSpec?.uniqueId}
        />

        <div className="mb-4">
          {!loading && specifications.length > 0 && (
            <div className="w-full max-w-lg">
              <label
                className="mb-1.5 block text-sm font-medium text-secondary-700 dark:text-secondary-300"
                htmlFor="specification-name-filter"
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
                      context: 'specifications',
                      name: 'text field',
                      priority: 330,
                      value: 'name filter',
                    })}
                    id="specification-name-filter"
                    onChange={e => setNameFilter(e.target.value)}
                    placeholder={t('filterByNamePlaceholder')}
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

        {showSpinner && (
          <div
            aria-live="polite"
            className="flex min-h-80 flex-col items-center justify-center gap-3 px-6 py-16"
            data-testid="requirement-specifications-loading"
            role="status"
          >
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600 dark:border-primary-700 dark:border-t-primary-400" />
            <p className="text-secondary-600 dark:text-secondary-400">
              {tc('loading')}
            </p>
          </div>
        )}
        {!loading && (
          <div
            className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm overflow-hidden"
            {...devMarker({
              context: 'specifications',
              name: 'crud table',
              priority: 340,
            })}
            ref={tableAnchorRef}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                    <th className="py-3 px-4 font-medium">{t('name')}</th>
                    <th className="py-3 px-4 font-medium">
                      {t('responsible')}
                    </th>
                    <th className="py-3 px-4 font-medium">
                      {t('governanceObjectType')}
                    </th>
                    <th className="py-3 px-4 font-medium">
                      {t('implementationType')}
                    </th>
                    <th className="py-3 px-4 font-medium">
                      {t('lifecycleStatus')}
                    </th>
                    <th className="py-3 px-4 font-medium">{t('itemCount')}</th>
                    <th className="py-3 px-4 font-medium">
                      {t('requirementAreas')}
                    </th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {filteredSpecifications.map(spec => (
                    <tr
                      className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                      key={spec.id}
                    >
                      <td className="py-3 px-4 font-medium">
                        <Link
                          className="text-primary-700 dark:text-primary-300 hover:underline"
                          href={`/specifications/${spec.uniqueId}`}
                        >
                          {getName(spec)}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                        {getResponsibleDisplayName(spec) ? (
                          <div className="min-w-36">
                            <div className="font-medium text-secondary-800 dark:text-secondary-100">
                              {getResponsibleDisplayName(spec)}
                            </div>
                            <div className="mt-0.5 font-mono text-xs text-secondary-500 dark:text-secondary-400">
                              {spec.responsibleHsaId}
                            </div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                        {getTaxonomyName(spec.governanceObjectType)}
                      </td>
                      <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                        {getTaxonomyName(spec.implementationType)}
                      </td>
                      <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                        {getTaxonomyName(spec.lifecycleStatus)}
                      </td>
                      <td className="py-3 px-4">
                        {spec.itemCount > 0 ? (
                          <Link
                            className="text-primary-700 dark:text-primary-300 hover:underline font-medium"
                            href={`/specifications/${spec.uniqueId}`}
                          >
                            {spec.itemCount}
                          </Link>
                        ) : (
                          <span className="text-secondary-400">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <RequirementAreaPills
                          areas={spec.requirementAreas}
                          key={spec.requirementAreas
                            .map(area => `${area.id}:${area.name}`)
                            .join('|')}
                        />
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="flex justify-end gap-1">
                          <button
                            aria-label={tc('edit')}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:text-primary-300 dark:hover:bg-primary-950/30"
                            {...devMarker({
                              context: 'specifications',
                              name: 'table action',
                              value: 'edit',
                            })}
                            onClick={() => handleEdit(spec)}
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
                            aria-label={tc('delete')}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:text-red-400 dark:hover:bg-red-950/30"
                            {...devMarker({
                              context: 'specifications',
                              name: 'table action',
                              value: 'delete',
                            })}
                            onClick={e =>
                              handleDelete(spec, e.currentTarget as HTMLElement)
                            }
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
                  ))}
                  {fetchError ? (
                    <tr>
                      <td
                        className="px-4 py-10 text-center"
                        colSpan={specificationTableColumnCount}
                      >
                        <p
                          className="text-sm text-red-600 dark:text-red-400"
                          role="alert"
                        >
                          {fetchError}
                        </p>
                      </td>
                    </tr>
                  ) : specifications.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-10 text-center text-secondary-500 dark:text-secondary-400"
                        colSpan={specificationTableColumnCount}
                      >
                        {t('emptyState')}
                      </td>
                    </tr>
                  ) : specifications.length > 0 &&
                    filteredSpecifications.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-10 text-center text-secondary-500 dark:text-secondary-400"
                        colSpan={specificationTableColumnCount}
                      >
                        {tc('noResults')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
