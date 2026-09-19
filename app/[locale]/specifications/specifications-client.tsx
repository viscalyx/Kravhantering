'use client'

import {
  Check,
  CircleHelp,
  LayoutGrid,
  Pencil,
  Plus,
  Rows2,
  Search,
  Table2,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useDeferredValue, useEffect, useRef, useState } from 'react'
import CoAuthorsManagementModal from '@/components/CoAuthorsManagementModal'
import { useConfirmModal } from '@/components/ConfirmModal'
import FloatingActionRail from '@/components/FloatingActionRail'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import ListWorkspace from '@/components/ListWorkspace'
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

const listViews = ['table', 'rows', 'cards'] as const
type ListView = (typeof listViews)[number]
const SPECIFICATIONS_LOADING_INDICATOR_DELAY_MS = 1000
const EMPTY_INITIAL_DATA: RequirementsSpecificationsInitialData = {
  collectionPermissions: { canCreateSpecification: true },
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
  const [collectionPermissions, setCollectionPermissions] = useState(
    resolvedInitialData.collectionPermissions ?? {
      canCreateSpecification: true,
    },
  )
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
  const specificationTableColumnCount = 6

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
      const res = await apiFetch('/api/requirements-specifications', { signal })
      if (!res.ok) {
        const details = await readResponseMessage(res)
        throw new Error(
          details
            ? `${t('loadSpecificationsFailed')}: ${details}`
            : t('loadSpecificationsFailed'),
        )
      }
      const body = (await res.json()) as {
        collectionPermissions?: { canCreateSpecification?: boolean }
        specifications?: Specification[]
      }
      setCollectionPermissions({
        canCreateSpecification:
          body.collectionPermissions?.canCreateSpecification ?? true,
      })
      return body.specifications ?? []
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
  const [coAuthorsSpec, setCoAuthorsSpec] = useState<Specification | null>(null)
  const [nameFilter, setNameFilter] = useState('')
  const [view, setView] = useState<ListView>('table')
  const [filterHelpOpen, setFilterHelpOpen] = useState(false)
  const [currentUser, setCurrentUser] =
    useState<SpecificationFormModalCurrentUser | null>(null)
  const [currentUserLoading, setCurrentUserLoading] = useState(true)
  const [currentUserUnavailable, setCurrentUserUnavailable] = useState(false)
  const deferredNameFilter = useDeferredValue(nameFilter)
  const normalizedNameFilter = deferredNameFilter
    .trim()
    .toLocaleLowerCase(locale)
  const hasActiveNameFilter = nameFilter.trim().length > 0
  const filteredSpecifications = specifications
    .filter(spec =>
      getName(spec).toLocaleLowerCase(locale).includes(normalizedNameFilter),
    )
    .sort((left, right) =>
      left.name.localeCompare(right.name, locale, { sensitivity: 'base' }),
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
    }, SPECIFICATIONS_LOADING_INDICATOR_DELAY_MS)

    return () => {
      if (spinnerTimerRef.current) {
        clearTimeout(spinnerTimerRef.current)
        spinnerTimerRef.current = null
      }
    }
  }, [isFetchingSpecifications])

  const handleEdit = (spec: Specification) => {
    if (spec.permissions && !spec.permissions.canEditContent) {
      return
    }
    setEditSpec(spec)
    setShowForm(true)
  }

  const handleManageCoAuthors = (spec: Specification) => {
    if (!spec.permissions?.canManageAssignments) return
    setCoAuthorsSpec(spec)
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
      const res = await apiFetch(
        `/api/requirements-specifications/${spec.id}`,
        {
          method: 'DELETE',
        },
      )

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

  const closeCoAuthorsModal = () => {
    setCoAuthorsSpec(null)
  }

  const currentUserError = currentUserUnavailable
    ? t('currentUserUnavailable')
    : null
  const createDisabled =
    currentUserLoading ||
    !currentUser ||
    !collectionPermissions.canCreateSpecification
  const createDisabledReason = currentUserLoading
    ? t('currentUserLoading')
    : currentUserError ||
      (!collectionPermissions.canCreateSpecification
        ? t('readOnlyNotice')
        : null)
  const showSpecifications = !loading && !showSpinner

  const renderName = (spec: Specification) => (
    <div
      className={
        view === 'rows'
          ? 'flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1'
          : 'min-w-0'
      }
    >
      <Link
        className="min-w-0 wrap-anywhere font-medium text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-primary-300"
        href={`/specifications/${spec.id}`}
      >
        {getName(spec)}
      </Link>
      {spec.specificationCode && (
        <div
          className="mt-0.5 max-w-full wrap-anywhere font-mono text-xs text-secondary-600 dark:text-secondary-400"
          {...devMarker({
            context: 'specifications',
            name: 'specification code',
          })}
        >
          <span className="sr-only">{t('specificationCode')}: </span>
          {spec.specificationCode}
        </div>
      )}
    </div>
  )
  const renderResponsible = (spec: Specification) => (
    <div
      className="min-w-0"
      {...devMarker({
        context: 'specifications',
        name: 'responsible identity',
      })}
    >
      {getResponsibleDisplayName(spec) && (
        <div className="wrap-anywhere font-medium text-secondary-800 dark:text-secondary-100">
          {getResponsibleDisplayName(spec)}
        </div>
      )}
      {spec.responsibleHsaId ? (
        <div
          className="mt-0.5 overflow-x-auto whitespace-nowrap rounded font-mono text-xs text-secondary-600 focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-secondary-400"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Enables keyboard scrolling of long HSA identifiers.
          tabIndex={0}
          title={spec.responsibleHsaId}
        >
          {spec.responsibleHsaId}
        </div>
      ) : !getResponsibleDisplayName(spec) ? (
        '—'
      ) : null}
    </div>
  )
  const renderClassifications = (spec: Specification) => (
    <dl
      className={
        view === 'cards'
          ? 'grid gap-3 text-xs sm:grid-cols-3'
          : 'flex flex-wrap gap-x-6 gap-y-2 text-xs'
      }
    >
      {(
        [
          ['governanceObjectType', spec.governanceObjectType],
          ['implementationType', spec.implementationType],
          ['lifecycleStatus', spec.lifecycleStatus],
        ] as const
      ).map(([key, value]) => (
        <div className="min-w-0 wrap-anywhere" key={key}>
          <dt className="text-secondary-600 dark:text-secondary-400">
            {t(key)}
          </dt>
          <dd className="mt-1 text-secondary-900 dark:text-secondary-100">
            {getTaxonomyName(value)}
          </dd>
        </div>
      ))}
    </dl>
  )
  const renderActions = (spec: Specification) => (
    <div className="flex shrink-0 justify-end gap-1">
      {spec.permissions?.canManageAssignments ? (
        <button
          aria-label={t('manageCoAuthors')}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-secondary-700 transition-colors hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:text-secondary-300 dark:hover:bg-secondary-800/70"
          {...devMarker({
            context: 'specifications',
            name: 'table action',
            value: 'manage co-authors',
          })}
          onClick={() => handleManageCoAuthors(spec)}
          title={t('manageCoAuthors')}
          type="button"
        >
          <UsersRound
            aria-hidden="true"
            className="h-4 w-4"
            focusable={false}
          />
        </button>
      ) : (
        <span aria-hidden="true" className="h-7 w-7" />
      )}
      {(spec.permissions?.canEditContent ?? true) ? (
        <button
          aria-label={tc('edit')}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:text-primary-300 dark:hover:bg-primary-950/30"
          {...devMarker({
            context: 'specifications',
            name: 'table action',
            value: 'edit',
          })}
          onClick={() => handleEdit(spec)}
          title={tc('edit')}
          type="button"
        >
          <Pencil aria-hidden="true" className="h-4 w-4" focusable={false} />
        </button>
      ) : (
        <span aria-hidden="true" className="h-7 w-7" />
      )}
      {(spec.permissions?.canEditContent ?? true) ? (
        <button
          aria-label={tc('delete')}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:text-red-400 dark:hover:bg-red-950/30"
          {...devMarker({
            context: 'specifications',
            name: 'table action',
            value: 'delete',
          })}
          onClick={e => handleDelete(spec, e.currentTarget as HTMLElement)}
          title={tc('delete')}
          type="button"
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" focusable={false} />
        </button>
      ) : (
        <span aria-hidden="true" className="h-7 w-7" />
      )}
    </div>
  )
  const listMessage =
    fetchError ||
    (specifications.length === 0
      ? t('emptyState')
      : filteredSpecifications.length === 0
        ? tc('noResults')
        : null)

  return (
    <div className="section-padding">
      <ListWorkspace context="specifications" ref={contentRef} reserveActions>
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
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
              {tn('specifications')}
            </h1>
            <fieldset
              aria-label={t('viewSwitcher')}
              className="flex gap-1 rounded-xl border border-secondary-200 bg-white p-1 dark:border-secondary-700 dark:bg-secondary-900"
              {...devMarker({
                context: 'specifications',
                name: 'view switcher',
                value: view,
              })}
              onKeyDown={event => {
                if (
                  !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(
                    event.key,
                  )
                )
                  return
                event.preventDefault()
                const index = listViews.indexOf(view)
                const next =
                  event.key === 'Home'
                    ? 'table'
                    : event.key === 'End'
                      ? 'cards'
                      : listViews[
                          (index + (event.key === 'ArrowLeft' ? 2 : 1)) % 3
                        ]
                setView(next)
                event.currentTarget
                  .querySelector<HTMLButtonElement>(
                    `[data-list-view="${next}"]`,
                  )
                  ?.focus()
              }}
            >
              {listViews.map(key => {
                const Icon =
                  key === 'table' ? Table2 : key === 'rows' ? Rows2 : LayoutGrid
                return (
                  <button
                    aria-label={t(`views.${key}`)}
                    aria-pressed={view === key}
                    className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-primary-500 ${view === key ? 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200' : 'text-secondary-600 hover:bg-secondary-100 dark:text-secondary-300 dark:hover:bg-secondary-800'}`}
                    data-list-view={key}
                    key={key}
                    onClick={() => setView(key)}
                    tabIndex={view === key ? 0 : -1}
                    title={t(`views.${key}`)}
                    type="button"
                  >
                    <Icon aria-hidden="true" className="h-4 w-4" />
                    {view === key && (
                      <Check
                        aria-hidden="true"
                        className="absolute right-0.5 bottom-0.5 h-2.5 w-2.5"
                      />
                    )}
                  </button>
                )
              })}
            </fieldset>
          </div>
          <div className="w-full xl:max-w-xl">
            {showSpecifications && specifications.length > 0 && (
              <div className="w-full">
                <label
                  className="mb-1.5 block text-sm font-medium text-secondary-700 dark:text-secondary-300"
                  htmlFor="specification-name-filter"
                >
                  {t('filterByName')}
                </label>
                <div
                  className="flex items-center gap-2 rounded-xl border border-secondary-200 bg-white px-3 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-800/50"
                  {...devMarker({
                    context: 'specifications',
                    name: 'search field',
                    value: 'name filter',
                  })}
                >
                  <Search
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-secondary-500 dark:text-secondary-400"
                  />
                  <input
                    autoComplete="off"
                    className="min-h-11 min-w-0 flex-1 bg-transparent py-2 text-sm text-secondary-900 outline-none placeholder:text-secondary-500 dark:text-secondary-100 dark:placeholder:text-secondary-400"
                    {...devMarker({
                      context: 'specifications',
                      name: 'text field',
                      priority: 330,
                      value: 'name filter',
                    })}
                    aria-describedby={
                      filterHelpOpen ? 'specification-filter-help' : undefined
                    }
                    id="specification-name-filter"
                    onChange={e => setNameFilter(e.target.value)}
                    placeholder={t('filterByNamePlaceholder')}
                    type="text"
                    value={nameFilter}
                  />
                  <button
                    aria-controls="specification-filter-help"
                    aria-expanded={filterHelpOpen}
                    aria-label={t('filterHelp')}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-secondary-600 hover:bg-secondary-100 focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-secondary-300 dark:hover:bg-secondary-700"
                    onClick={() => setFilterHelpOpen(value => !value)}
                    type="button"
                  >
                    <CircleHelp aria-hidden="true" className="h-4 w-4" />
                  </button>
                  {hasActiveNameFilter && (
                    <button
                      aria-label={tc('clearSearch')}
                      onClick={() => setNameFilter('')}
                      title={tc('clearSearch')}
                      type="button"
                      {...devMarker({
                        context: 'specifications',
                        name: 'button',
                        value: 'clear name filter',
                      })}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-secondary-600 hover:bg-secondary-100 focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-secondary-300 dark:hover:bg-secondary-700"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {filterHelpOpen && (
                  <p
                    className="mt-2 text-sm text-secondary-600 dark:text-secondary-400"
                    id="specification-filter-help"
                  >
                    {t('filterHelpText')}
                  </p>
                )}
              </div>
            )}
          </div>
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
          currentUserUnavailable={currentUserUnavailable}
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
          specificationId={editSpec?.id}
        />

        {coAuthorsSpec ? (
          <CoAuthorsManagementModal
            description={t('coAuthorsHelp')}
            developerModeValue="manage specification co-authors"
            endpoint={`/api/requirements-specifications/${coAuthorsSpec.id}/co-authors`}
            hsaIdHelp={t('coAuthorHsaIdHelp')}
            hsaIdLabel={t('coAuthorHsaId')}
            loadErrorMessage={t('loadCoAuthorsFailed')}
            loadingMessage={t('loadingCoAuthors')}
            noCoAuthorsMessage={t('noCoAuthors')}
            onChanged={async () => {
              await specificationsResource.reload()
            }}
            onClose={closeCoAuthorsModal}
            open
            purpose="requirements_specification_co_author"
            removeConfirmMessage={name => t('removeCoAuthorConfirm', { name })}
            removeLabel={t('removeCoAuthor')}
            savedCoAuthorsHeading={t('savedCoAuthors')}
            saveErrorMessage={t('saveCoAuthorsFailed')}
            scopeId={coAuthorsSpec.id}
            title={t('coAuthors')}
            titleId="specification-co-authors-title"
            verifiedDraftMessage={name => t('verifiedCoAuthorDraft', { name })}
          />
        ) : null}

        {showSpinner && (
          <div
            aria-live="polite"
            className="flex min-h-80 flex-col items-center justify-center gap-3 px-6 py-16"
            data-testid="requirement-specifications-loading"
            role="status"
            {...devMarker({
              context: 'specifications',
              name: 'loading status',
              priority: 330,
              value: 'specifications list',
            })}
          >
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600 dark:border-primary-700 dark:border-t-primary-400" />
            <p className="text-secondary-600 dark:text-secondary-400">
              {tc('loading')}
            </p>
          </div>
        )}
        {showSpecifications && (
          <div
            ref={tableAnchorRef}
            {...devMarker({
              context: 'specifications',
              name:
                view === 'table'
                  ? 'crud table'
                  : view === 'rows'
                    ? 'two-row list'
                    : 'card grid',
              priority: 340,
            })}
          >
            {view === 'table' ? (
              <div className="relative overflow-x-auto rounded-2xl border border-secondary-200 bg-white/80 shadow-sm dark:border-secondary-700 dark:bg-secondary-900/60">
                <table className="w-full min-w-225 table-fixed text-sm">
                  <colgroup>
                    <col />
                    <col className="w-60" />
                    <col className="w-36" />
                    <col className="w-36" />
                    <col className="w-36" />
                    <col className="w-28" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-secondary-200 bg-secondary-50/80 text-left text-secondary-700 dark:border-secondary-700 dark:bg-secondary-800/30 dark:text-secondary-300">
                      {[
                        'name',
                        'responsible',
                        'governanceObjectType',
                        'implementationType',
                        'lifecycleStatus',
                      ].map(key => (
                        <th
                          className="px-3 py-3 text-xs font-medium wrap-anywhere"
                          key={key}
                          scope="col"
                        >
                          {t(key)}
                        </th>
                      ))}
                      <th scope="col">
                        <span className="sr-only">{t('actions')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSpecifications.map(spec => (
                      <tr
                        className="border-b border-secondary-200 transition-colors hover:bg-primary-50/40 dark:border-secondary-700 dark:hover:bg-primary-950/20"
                        key={spec.id}
                      >
                        <td className="px-4 py-3">{renderName(spec)}</td>
                        <td className="px-4 py-3">{renderResponsible(spec)}</td>
                        <td className="px-3 py-3 wrap-anywhere text-secondary-600 dark:text-secondary-400">
                          {getTaxonomyName(spec.governanceObjectType)}
                        </td>
                        <td className="px-3 py-3 wrap-anywhere text-secondary-600 dark:text-secondary-400">
                          {getTaxonomyName(spec.implementationType)}
                        </td>
                        <td className="px-3 py-3 wrap-anywhere text-secondary-600 dark:text-secondary-400">
                          {getTaxonomyName(spec.lifecycleStatus)}
                        </td>
                        <td className="px-2 py-3 align-top">
                          {renderActions(spec)}
                        </td>
                      </tr>
                    ))}
                    {listMessage && (
                      <tr>
                        <td
                          className="px-4 py-10 text-center text-secondary-600 dark:text-secondary-400"
                          colSpan={specificationTableColumnCount}
                        >
                          <p role={fetchError ? 'alert' : 'status'}>
                            {listMessage}
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <>
                <div
                  className={
                    view === 'cards'
                      ? 'grid gap-4 xl:grid-cols-2'
                      : 'overflow-hidden rounded-2xl border border-secondary-200 bg-white/80 dark:border-secondary-700 dark:bg-secondary-900/60'
                  }
                >
                  {filteredSpecifications.map(spec => (
                    <article
                      aria-label={spec.name}
                      className={
                        view === 'cards'
                          ? 'flex min-w-0 flex-col gap-4 rounded-2xl border border-secondary-200 bg-white/80 p-4 dark:border-secondary-700 dark:bg-secondary-900/60'
                          : 'min-w-0 border-b border-secondary-200 p-4 last:border-b-0 dark:border-secondary-700'
                      }
                      key={spec.id}
                    >
                      {view === 'cards' ? (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            {renderName(spec)}
                            {renderActions(spec)}
                          </div>
                          <div className="min-w-0 border-l-2 border-secondary-200 pl-3 dark:border-secondary-700">
                            <p className="mb-1 text-xs text-secondary-600 dark:text-secondary-400">
                              {t('responsible')}
                            </p>
                            {renderResponsible(spec)}
                          </div>
                        </>
                      ) : (
                        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[minmax(0,1fr)_15rem_auto]">
                          <div className="col-span-2 min-w-0 md:col-span-1">
                            {renderName(spec)}
                          </div>
                          {renderResponsible(spec)}
                          {renderActions(spec)}
                        </div>
                      )}
                      {renderClassifications(spec)}
                    </article>
                  ))}
                </div>
                {listMessage && (
                  <p
                    className="px-4 py-10 text-center text-secondary-600 dark:text-secondary-400"
                    role={fetchError ? 'alert' : 'status'}
                  >
                    {listMessage}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </ListWorkspace>
    </div>
  )
}
